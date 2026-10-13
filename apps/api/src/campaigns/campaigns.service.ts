import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  CampaignStatus,
  PublishJobStatus,
  RunStatus,
  TargetMode,
  TargetType,
  createPrismaClient,
} from '@autospace/database';
import { Queue } from 'bullmq';

export type CreateCampaignInput = {
  name?: string;
  slug?: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type UpdateCampaignInput = Partial<CreateCampaignInput> & {
  status?: CampaignStatus;
};

export type CreateContentInput = {
  title?: string | null;
  body?: string;
  mediaUrl?: string | null;
};

export type CreateTargetInput = {
  name?: string;
  externalId?: string | null;
  type?: TargetType;
  mode?: TargetMode;
  metadata?: Record<string, unknown> | null;
};

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function optionalDate(value: string | null | undefined, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return date;
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class CampaignsService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();
  private readonly queue: Queue;

  constructor() {
    this.queue = new Queue('campaign-distribution', {
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
  }

  list() {
    return this.prisma.campaign.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { contentVariants: true, targets: true, runs: true },
        },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, createdAt: true },
        },
      },
    });
  }

  async findOne(identifier: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
      include: {
        contentVariants: { orderBy: { createdAt: 'asc' } },
        targets: { orderBy: { createdAt: 'asc' } },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            publishJobs: {
              orderBy: { createdAt: 'asc' },
              include: { target: true, contentVariant: true },
            },
          },
        },
      },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(input: CreateCampaignInput) {
    const name = requiredText(input.name, 'name');
    const slug = slugify(input.slug?.trim() || name);
    if (!slug) throw new BadRequestException('slug is invalid');

    return this.prisma.campaign.create({
      data: {
        name,
        slug,
        startsAt: optionalDate(input.startsAt, 'startsAt'),
        endsAt: optionalDate(input.endsAt, 'endsAt'),
      },
    });
  }

  async update(identifier: string, input: UpdateCampaignInput) {
    const campaign = await this.findRecord(identifier);
    const data: Record<string, unknown> = {};

    if (input.name !== undefined) data.name = requiredText(input.name, 'name');
    if (input.slug !== undefined) {
      const slug = slugify(requiredText(input.slug, 'slug'));
      if (!slug) throw new BadRequestException('slug is invalid');
      data.slug = slug;
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.startsAt !== undefined) data.startsAt = optionalDate(input.startsAt, 'startsAt');
    if (input.endsAt !== undefined) data.endsAt = optionalDate(input.endsAt, 'endsAt');

    return this.prisma.campaign.update({
      where: { id: campaign.id },
      data,
    });
  }

  async remove(identifier: string) {
    const campaign = await this.findRecord(identifier);
    await this.prisma.campaign.delete({ where: { id: campaign.id } });
    return { deleted: true, id: campaign.id };
  }

  async addContent(identifier: string, input: CreateContentInput) {
    const campaign = await this.findRecord(identifier);
    return this.prisma.contentVariant.create({
      data: {
        campaignId: campaign.id,
        title: input.title?.trim() || null,
        body: requiredText(input.body, 'body'),
        mediaUrl: input.mediaUrl?.trim() || null,
      },
    });
  }

  async addTarget(identifier: string, input: CreateTargetInput) {
    const campaign = await this.findRecord(identifier);
    if (!input.type || !Object.values(TargetType).includes(input.type)) {
      throw new BadRequestException('type is invalid');
    }
    if (!input.mode || !Object.values(TargetMode).includes(input.mode)) {
      throw new BadRequestException('mode is invalid');
    }

    return this.prisma.distributionTarget.create({
      data: {
        campaignId: campaign.id,
        name: requiredText(input.name, 'name'),
        externalId: input.externalId?.trim() || null,
        type: input.type,
        mode: input.mode,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async deactivateTarget(identifier: string, targetId: string) {
    const campaign = await this.findRecord(identifier);
    const target = await this.prisma.distributionTarget.findFirst({
      where: { id: targetId, campaignId: campaign.id },
    });
    if (!target) throw new NotFoundException('Target not found');

    return this.prisma.distributionTarget.update({
      where: { id: target.id },
      data: { active: false },
    });
  }

  async bootstrapDemo() {
    const existing = await this.prisma.campaign.findUnique({
      where: { slug: 'hola-halo' },
    });
    if (existing) return this.findOne(existing.id);

    const campaign = await this.prisma.campaign.create({
      data: {
        name: 'Hola Halo · Nhìn Hòa Lạc',
        slug: 'hola-halo',
        contentVariants: {
          create: [
            {
              title: 'Giới thiệu cuộc thi',
              body: 'Hola Halo · Nhìn Hòa Lạc là chiến dịch mẫu. Hãy thay nội dung này bằng bài chính thức trước khi kết nối provider.',
            },
            {
              title: 'Góc nhìn cộng đồng',
              body: 'Bạn thích góc nào của Hòa Lạc nhất? Đây là biến thể nội dung mẫu để kiểm thử luồng phân phối.',
            },
          ],
        },
        targets: {
          create: [
            {
              name: 'Facebook Page · Hola',
              externalId: 'facebook-page-hola',
              type: TargetType.FACEBOOK_PAGE,
              mode: TargetMode.API,
            },
            {
              name: 'Facebook Page · KTHL',
              externalId: 'facebook-page-kthl',
              type: TargetType.FACEBOOK_PAGE,
              mode: TargetMode.API,
            },
            {
              name: 'Community Group · Demo',
              externalId: 'community-group-demo',
              type: TargetType.FACEBOOK_GROUP,
              mode: TargetMode.MANUAL_CONFIRMATION,
            },
          ],
        },
      },
    });

    return this.findOne(campaign.id);
  }

  async run(identifier: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
      include: {
        targets: { where: { active: true }, orderBy: { createdAt: 'asc' } },
        contentVariants: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.targets.length) throw new BadRequestException('Campaign has no active targets');
    if (!campaign.contentVariants.length) throw new BadRequestException('Campaign has no content variants');

    const run = await this.prisma.campaignRun.create({
      data: {
        campaignId: campaign.id,
        status: RunStatus.QUEUED,
        publishJobs: {
          create: campaign.targets.map((target, index) => ({
            targetId: target.id,
            contentVariantId: campaign.contentVariants[index % campaign.contentVariants.length].id,
            status: PublishJobStatus.QUEUED,
          })),
        },
      },
      include: {
        publishJobs: { include: { target: true, contentVariant: true } },
      },
    });

    try {
      await this.queue.addBulk(
        run.publishJobs.map((publishJob) => ({
          name:
            publishJob.target.mode === TargetMode.API
              ? 'publish-authorized-target'
              : 'prepare-manual-target',
          data: {
            campaignId: campaign.id,
            runId: run.id,
            publishJobId: publishJob.id,
            targetId: publishJob.targetId,
            contentVariantId: publishJob.contentVariantId,
            mode: publishJob.target.mode,
          },
          opts: {
            jobId: publishJob.id,
            attempts: publishJob.target.mode === TargetMode.API ? 3 : 1,
            backoff:
              publishJob.target.mode === TargetMode.API
                ? { type: 'exponential', delay: 3000 }
                : undefined,
            removeOnComplete: 200,
            removeOnFail: 500,
          },
        })),
      );

      await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.RUNNING },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue unavailable';
      await this.prisma.$transaction([
        this.prisma.campaignRun.update({
          where: { id: run.id },
          data: { status: RunStatus.FAILED, finishedAt: new Date() },
        }),
        this.prisma.publishJob.updateMany({
          where: { runId: run.id },
          data: { status: PublishJobStatus.FAILED, error: message },
        }),
      ]);
      throw new BadRequestException(`Could not queue campaign: ${message}`);
    }

    return {
      campaignId: campaign.id,
      runId: run.id,
      queued: run.publishJobs.length,
      apiTargets: run.publishJobs.filter((job) => job.target.mode === TargetMode.API).length,
      manualTargets: run.publishJobs.filter(
        (job) => job.target.mode === TargetMode.MANUAL_CONFIRMATION,
      ).length,
      status: RunStatus.QUEUED,
    };
  }

  private async findRecord(identifier: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async onModuleDestroy() {
    await Promise.all([this.queue.close(), this.prisma.$disconnect()]);
  }
}
