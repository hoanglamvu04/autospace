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

    let status = ConnectionStatus.CONNECTED;
    let lastError: string | null = null;

    try {
      const credentials = row.secretEncrypted ? decryptCredentials(row.secretEncrypted) : {};
      const config = (row.publicConfig ?? {}) as Record<string, unknown>;

      if (row.provider === ConnectionProvider.FACEBOOK_PAGE) {
        if (!row.externalAccountId) {
          status = ConnectionStatus.ERROR;
          lastError = 'Thiếu Page ID / external account ID';
        } else if (!credentials.accessToken) {
          status = ConnectionStatus.MISSING_PERMISSION;
          lastError = 'Chưa có Page access token';
        }
      }

      if (row.provider === ConnectionProvider.WEBSITE) {
        if (typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
          status = ConnectionStatus.ERROR;
          lastError = 'Thiếu base URL của website provider';
        } else if (!credentials.apiKey) {
          status = ConnectionStatus.MISSING_PERMISSION;
          lastError = 'Chưa có API key';
        }
      }
    } catch (error) {
      status = ConnectionStatus.ERROR;
      lastError = error instanceof Error ? error.message : 'Không thể kiểm tra connection';
    }

    const updated = await this.prisma.providerConnection.update({
      where: { id },
      data: { status, lastError, lastTestedAt: new Date() },
      include: { _count: { select: { targets: true } } },
    });

    return {
      ...this.publicConnection(updated),
      testMode: 'CONFIGURATION_ONLY',
      message:
        status === ConnectionStatus.CONNECTED
          ? 'Cấu hình provider hợp lệ. Chưa gọi API bên ngoài ở Connections V1.'
          : lastError,
    };
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
