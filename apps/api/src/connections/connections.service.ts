import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  ConnectionProvider,
  ConnectionStatus,
  createPrismaClient,
} from '@autospace/database';

export type ConnectionCredentials = {
  accessToken?: string;
  apiKey?: string;
  webhookSecret?: string;
};

export type CreateConnectionInput = {
  name?: string;
  provider?: ConnectionProvider;
  externalAccountId?: string | null;
  publicConfig?: Record<string, unknown> | null;
  credentials?: ConnectionCredentials | null;
};

export type UpdateConnectionInput = Partial<CreateConnectionInput>;

export type PublishConnectionInput = {
  message?: string;
  link?: string | null;
};

type MetaErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function encryptionKey() {
  const raw = process.env.CONNECTION_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new BadRequestException('CONNECTION_ENCRYPTION_KEY is required before saving provider credentials');
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  throw new BadRequestException('CONNECTION_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
}

function encryptCredentials(credentials: ConnectionCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((value) => value.toString('base64url')).join('.');
}

function decryptCredentials(payload: string): ConnectionCredentials {
  const [ivPart, tagPart, encryptedPart] = payload.split('.');
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('Invalid encrypted credential payload');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as ConnectionCredentials;
}

function metaVersion() {
  const value = process.env.META_GRAPH_API_VERSION?.trim() || 'v26.0';
  return value.startsWith('v') ? value : `v${value}`;
}

async function metaRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const url = `https://graph.facebook.com/${metaVersion()}/${path.replace(/^\//, '')}`;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
  }

  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15000),
  });

  const payload = (await response.json().catch(() => ({}))) as T & MetaErrorBody;
  const metaError = payload.error;
  if (!response.ok || metaError) {
    throw new MetaGraphError(
      metaError?.message || `Meta Graph API returned ${response.status}`,
      metaError?.code,
      metaError?.error_subcode,
    );
  }

  return payload as T;
}

function statusForMetaError(error: unknown): ConnectionStatus {
  if (!(error instanceof MetaGraphError)) return ConnectionStatus.ERROR;
  if (error.code === 190) return ConnectionStatus.EXPIRED;
  if (error.code === 10 || error.code === 200) return ConnectionStatus.MISSING_PERMISSION;
  return ConnectionStatus.ERROR;
}

@Injectable()
export class ConnectionsService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  async list() {
    const rows = await this.prisma.providerConnection.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { targets: true } } },
    });
    return rows.map((row) => this.publicConnection(row));
  }

  async findOne(id: string) {
    const row = await this.prisma.providerConnection.findUnique({
      where: { id },
      include: {
        _count: { select: { targets: true } },
        targets: { select: { id: true, name: true, type: true, active: true } },
      },
    });
    if (!row) throw new NotFoundException('Connection not found');
    return this.publicConnection(row);
  }

  async create(input: CreateConnectionInput) {
    if (!input.provider || !Object.values(ConnectionProvider).includes(input.provider)) {
      throw new BadRequestException('provider is invalid');
    }

    const encrypted = input.credentials ? encryptCredentials(this.cleanCredentials(input.credentials)) : null;
    const row = await this.prisma.providerConnection.create({
      data: {
        name: requiredText(input.name, 'name'),
        provider: input.provider,
        externalAccountId: input.externalAccountId?.trim() || null,
        publicConfig: input.publicConfig as any,
        secretEncrypted: encrypted,
        status: ConnectionStatus.DISCONNECTED,
      },
      include: { _count: { select: { targets: true } } },
    });
    return this.publicConnection(row);
  }

  async update(id: string, input: UpdateConnectionInput) {
    const current = await this.prisma.providerConnection.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Connection not found');

    const data: any = {};
    if (input.name !== undefined) data.name = requiredText(input.name, 'name');
    if (input.provider !== undefined) {
      if (!Object.values(ConnectionProvider).includes(input.provider)) {
        throw new BadRequestException('provider is invalid');
      }
      data.provider = input.provider;
      data.status = ConnectionStatus.DISCONNECTED;
      data.lastError = null;
    }
    if (input.externalAccountId !== undefined) {
      data.externalAccountId = input.externalAccountId?.trim() || null;
      data.status = ConnectionStatus.DISCONNECTED;
    }
    if (input.publicConfig !== undefined) {
      data.publicConfig = input.publicConfig as any;
      data.status = ConnectionStatus.DISCONNECTED;
    }
    if (input.credentials !== undefined && input.credentials !== null) {
      data.secretEncrypted = encryptCredentials(this.cleanCredentials(input.credentials));
      data.status = ConnectionStatus.DISCONNECTED;
      data.lastError = null;
    }

    const row = await this.prisma.providerConnection.update({
      where: { id },
      data,
      include: { _count: { select: { targets: true } } },
    });
    return this.publicConnection(row);
  }

  async remove(id: string) {
    const current = await this.prisma.providerConnection.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Connection not found');
    await this.prisma.providerConnection.delete({ where: { id } });
    return { deleted: true, id };
  }

  async test(id: string) {
    const row = await this.prisma.providerConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Connection not found');

    let status: ConnectionStatus = ConnectionStatus.CONNECTED;
    let lastError: string | null = null;
    let providerData: Record<string, unknown> | null = null;
    let testMode = 'CONFIGURATION_ONLY';

    try {
      const credentials = row.secretEncrypted ? decryptCredentials(row.secretEncrypted) : {};
      const config = (row.publicConfig ?? {}) as Record<string, unknown>;

      if (row.provider === ConnectionProvider.FACEBOOK_PAGE) {
        testMode = 'LIVE_META';
        if (!row.externalAccountId) {
          throw new BadRequestException('Thiếu Page ID / external account ID');
        }
        if (!credentials.accessToken) {
          status = ConnectionStatus.MISSING_PERMISSION;
          throw new BadRequestException('Chưa có Page access token');
        }

        const page = await metaRequest<{ id: string; name: string }>(
          'me?fields=id,name',
          credentials.accessToken,
        );

        if (String(page.id) !== String(row.externalAccountId)) {
          status = ConnectionStatus.ERROR;
          throw new BadRequestException(
            `Token thuộc Page ${page.name} (${page.id}), không khớp Page ID ${row.externalAccountId}`,
          );
        }

        providerData = {
          pageId: page.id,
          pageName: page.name,
          graphVersion: metaVersion(),
        };
      }

      if (row.provider === ConnectionProvider.WEBSITE) {
        if (typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
          status = ConnectionStatus.ERROR;
          throw new BadRequestException('Thiếu base URL của website provider');
        }
        if (!credentials.apiKey) {
          status = ConnectionStatus.MISSING_PERMISSION;
          throw new BadRequestException('Chưa có API key');
        }
      }
    } catch (error) {
      if (error instanceof MetaGraphError) status = statusForMetaError(error);
      else if (status === ConnectionStatus.CONNECTED) status = ConnectionStatus.ERROR;
      lastError = error instanceof Error ? error.message : 'Không thể kiểm tra connection';
    }

    const updated = await this.prisma.providerConnection.update({
      where: { id },
      data: { status, lastError, lastTestedAt: new Date() },
      include: { _count: { select: { targets: true } } },
    });

    return {
      ...this.publicConnection(updated),
      testMode,
      providerData,
      message:
        status === ConnectionStatus.CONNECTED
          ? row.provider === ConnectionProvider.FACEBOOK_PAGE
            ? `Meta xác nhận Page access token hợp lệ cho ${String(providerData?.pageName ?? row.name)}.`
            : 'Cấu hình website provider hợp lệ.'
          : lastError,
    };
  }

  async publish(id: string, input: PublishConnectionInput) {
    const row = await this.prisma.providerConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Connection not found');
    if (row.provider !== ConnectionProvider.FACEBOOK_PAGE) {
      throw new BadRequestException('Live publish V1 hiện chỉ hỗ trợ Facebook Page');
    }
    if (!row.externalAccountId) throw new BadRequestException('Connection chưa có Page ID');
    if (!row.secretEncrypted) throw new BadRequestException('Connection chưa có credential');

    const message = requiredText(input.message, 'message');
    const link = input.link?.trim() || null;
    if (link) {
      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        throw new BadRequestException('link must be a valid URL');
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('link must use http or https');
      }
    }

    const credentials = decryptCredentials(row.secretEncrypted);
    if (!credentials.accessToken) throw new BadRequestException('Connection chưa có Page access token');

    try {
      const page = await metaRequest<{ id: string; name: string }>(
        'me?fields=id,name',
        credentials.accessToken,
      );
      if (String(page.id) !== String(row.externalAccountId)) {
        throw new BadRequestException(
          `Token thuộc Page ${page.name} (${page.id}), không khớp Page ID ${row.externalAccountId}`,
        );
      }

      const form = new URLSearchParams({ message });
      if (link) form.set('link', link);

      const published = await metaRequest<{ id: string }>(
        `${row.externalAccountId}/feed`,
        credentials.accessToken,
        { method: 'POST', body: form },
      );

      let permalinkUrl: string | null = null;
      try {
        const detail = await metaRequest<{ id: string; permalink_url?: string }>(
          `${published.id}?fields=id,permalink_url`,
          credentials.accessToken,
        );
        permalinkUrl = detail.permalink_url ?? null;
      } catch {
        // Publishing already succeeded. A permalink lookup failure must not mark the post as failed.
      }

      await this.prisma.providerConnection.update({
        where: { id },
        data: {
          status: ConnectionStatus.CONNECTED,
          lastError: null,
          lastTestedAt: new Date(),
        },
      });

      return {
        published: true,
        provider: 'FACEBOOK_PAGE',
        page: { id: page.id, name: page.name },
        postId: published.id,
        permalinkUrl,
        graphVersion: metaVersion(),
      };
    } catch (error) {
      const status = error instanceof MetaGraphError ? statusForMetaError(error) : ConnectionStatus.ERROR;
      const messageText = error instanceof Error ? error.message : 'Không thể đăng bài lên Facebook Page';
      await this.prisma.providerConnection.update({
        where: { id },
        data: { status, lastError: messageText, lastTestedAt: new Date() },
      });
      throw new BadRequestException(messageText);
    }
  }

  private cleanCredentials(credentials: ConnectionCredentials) {
    const result: ConnectionCredentials = {};
    if (credentials.accessToken?.trim()) result.accessToken = credentials.accessToken.trim();
    if (credentials.apiKey?.trim()) result.apiKey = credentials.apiKey.trim();
    if (credentials.webhookSecret?.trim()) result.webhookSecret = credentials.webhookSecret.trim();
    if (!Object.keys(result).length) throw new BadRequestException('credentials cannot be empty');
    return result;
  }

  private publicConnection(row: any) {
    const { secretEncrypted, ...safe } = row;
    return {
      ...safe,
      hasCredentials: Boolean(secretEncrypted),
    };
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
