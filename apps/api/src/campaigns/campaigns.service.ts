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

export type UpdateContentInput = Partial<CreateContentInput>;

export type CreateTargetInput = {
  name?: string;
  externalId?: string | null;
  type?: TargetType;
  mode?: TargetMode;
  metadata?: Record<string, unknown> | null;
};

export type UpdateTargetInput = Partial<CreateTargetInput> & {
  active?: boolean;
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
    const data: any = {};

    if (input.name !== undefined) data.name = requiredText(input.name, 'name');
    if (input.slug !== undefined) {
      const slug = slugify(requiredText(input.slug, 'slug'));
      if (!slug) throw new BadRequestException('slug is invalid');
      data.slug = slug;
    }
    if (input.status !== undefined) {
      if (!Object.values(CampaignStatus).includes(input.status)) {
        throw new BadRequestException('status is invalid');
      }
      data.status = input.status;
    }
    if (input.startsAt !== undefined) data.startsAt = optionalDate(input.startsAt, 'startsAt');
    if (input.endsAt !== undefined) data.endsAt = optionalDate(input.endsAt, 'endsAt');

    return this.prisma.campaign.update({ where: { id: campaign.id }, data });
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

  async updateContent(identifier: string, contentId: string, input: UpdateContentInput) {
    const campaign = await this.findRecord(identifier);
    const content = await this.prisma.contentVariant.findFirst({
      where: { id: contentId, campaignId: campaign.id },
    });
    if (!content) throw new NotFoundException('Content variant not found');

    const data: any = {};
    if (input.title !== undefined) data.title = input.title?.trim() || null;
    if (input.body !== undefined) data.body = requiredText(input.body, 'body');
    if (input.mediaUrl !== undefined) data.mediaUrl = input.mediaUrl?.trim() || null;

    return this.prisma.contentVariant.update({ where: { id: content.id }, data });
  }

  async removeContent(identifier: string, contentId: string) {
    const campaign = await this.findRecord(identifier);
    const content = await this.prisma.contentVariant.findFirst({
      where: { id: contentId, campaignId: campaign.id },
    });
    if (!content) throw new NotFoundException('Content variant not found');
    await this.prisma.contentVariant.delete({ where: { id: content.id } });
    return { deleted: true, id: content.id };
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
        metadata: input.metadata as any,
      },
    });
  }

  async updateTarget(identifier: string, targetId: string, input: UpdateTargetInput) {
    const campaign = await this.findRecord(identifier);
    const target = await this.prisma.distributionTarget.findFirst({
      where: { id: targetId, campaignId: campaign.id },
    });
    if (!target) throw new NotFoundException('Target not found');

    const data: any = {};
    if (input.name !== undefined) data.name = requiredText(input.name, 'name');
    if (input.externalId !== undefined) data.externalId = input.externalId?.trim() || null;
    if (input.type !== undefined) {
      if (!Object.values(TargetType).includes(input.type)) throw new BadRequestException('type is invalid');
      data.type = input.type;
    }
    if (input.mode !== undefined) {
      if (!Object.values(TargetMode).includes(input.mode)) throw new BadRequestException('mode is invalid');
      data.mode = input.mode;
    }
    if (input.metadata !== undefined) data.metadata = input.metadata as any;
    if (input.active !== undefined) data.active = Boolean(input.active);

    return this.prisma.distributionTarget.update({ where: { id: target.id }, data });
  }

  async deactivateTarget(identifier: string, targetId: string) {
    return this.updateTarget(identifier, targetId, { active: false });
  }

  async bootstrapDemo() {
    const existing = await this.prisma.campaign.findUnique({ where: { slug: 'hola-halo' } });
    if (existing) return this.findOne(existing.id);

    const campaign = await this.prisma.campaign.create({
      data: {
        name: 'HALO HOLA 2026 · 52 góc nhìn · 1 Hòa Lạc',
        slug: 'hola-halo',
        status: CampaignStatus.RUNNING,
        startsAt: new Date('2026-10-10T00:00:00+07:00'),
        endsAt: new Date('2026-11-10T23:59:00+07:00'),
        contentVariants: {
          create: [
            {
              title: 'Công bố · 52 góc nhìn · 1 Hòa Lạc',
              body: 'HALO HOLA 2026 chính thức mở cổng. 52 góc nhìn · 1 Hòa Lạc — hãy kể Hòa Lạc theo cách của bạn qua ảnh, video, câu chuyện hoặc thiết kế. Tham gia miễn phí, có thể sáng tạo ngay bằng điện thoại. Hạn nhận bài: 23:59 ngày 10/11/2026. 15 giải thưởng, tổng giá trị 29 triệu đồng; giải cao nhất 10 triệu đồng + cúp. Xem thông tin và gửi bài tại holahalo.vn.',
            },
            {
              title: 'Câu hỏi cộng đồng · Hòa Lạc trong bạn là gì?',
              body: 'Nếu chỉ chọn một hình ảnh để kể về Hòa Lạc, bạn sẽ chọn điều gì: một bức tường đá ong, màu xanh sau cơn mưa, nắng trên campus hay một câu chuyện rất riêng? HALO HOLA 2026 đang tìm 52 góc nhìn như thế. Chọn chủ đề của bạn, sáng tạo và kể lại theo cách của chính mình. Hạn gửi bài 23:59 ngày 10/11/2026 · holahalo.vn.',
            },
            {
              title: '8 chủ đề sáng tạo',
              body: 'Bạn có thể bắt đầu từ 1 trong 8 chủ đề của HALO HOLA 2026: Nét Đoài · Sắc Mường · Không gian Kiến trúc · Hòa Lạc xanh · Nắng Hòa Lạc · Câu chuyện Hòa Lạc · Ước mơ Hòa Lạc · Sắc màu Hòa Lạc. Không cần máy ảnh chuyên nghiệp — ảnh, video, story hay thiết kế đều có thể trở thành góc nhìn của bạn. Tham gia miễn phí tại holahalo.vn.',
            },
            {
              title: 'CTA · Đừng chỉ đi qua Hòa Lạc',
              body: 'Đừng chỉ đi qua Hòa Lạc. Hãy nhìn. Hãy cảm. Và kể lại theo cách của bạn. HALO HOLA 2026 nhận bài đến 23:59 ngày 10/11/2026. 15 giải thưởng với tổng giá trị 29 triệu đồng, giải cao nhất 10 triệu đồng + cúp. Gửi tác phẩm tại holahalo.vn.',
            },
            {
              title: 'Sắc màu Hòa Lạc',
              body: 'Hòa Lạc trong mắt bạn có màu gì? Màu đá ong, nắng ấm, xanh rêu, xanh non hay những màu sắc đến từ kiến trúc, cảnh quan, đời sống và con người? Hãy biến màu sắc bạn nhìn thấy thành một tác phẩm cho HALO HOLA 2026. Tham gia miễn phí tại holahalo.vn.',
            },
            {
              title: 'Dành cho sinh viên · Điện thoại là đủ',
              body: 'Không cần thiết bị cầu kỳ. Một chiếc điện thoại và một góc nhìn riêng đã đủ để bắt đầu. Chụp một khoảnh khắc, quay một video ngắn, kể một câu chuyện hoặc thiết kế điều bạn cảm nhận về Hòa Lạc. HALO HOLA 2026 nhận bài đến 10/11/2026 tại holahalo.vn.',
            },
          ],
        },
        targets: {
          create: [
            { name: 'Facebook Page · HALO HOLA', externalId: 'halo-hola-page', type: TargetType.FACEBOOK_PAGE, mode: TargetMode.API, metadata: { tags: ['Hòa Lạc', 'cuộc thi', 'sáng tạo'], priority: 1 } },
            { name: 'Facebook Page · Đô Thị Hòa Lạc', externalId: 'dothihoalac-page', type: TargetType.FACEBOOK_PAGE, mode: TargetMode.API, metadata: { tags: ['Hòa Lạc', 'địa phương', 'cộng đồng'], priority: 2 } },
            { name: 'Facebook Page · Kiến Trúc Hòa Lạc', externalId: 'kientruchoalac-page', type: TargetType.FACEBOOK_PAGE, mode: TargetMode.API, metadata: { tags: ['kiến trúc', 'Hòa Lạc'], priority: 3 } },
            { name: 'Website · HALO HOLA', externalId: 'holahalo.vn', type: TargetType.WEBSITE, mode: TargetMode.API, metadata: { tags: ['owned', 'landing-page'], priority: 1 } },
            { name: 'Website · Đô Thị Hòa Lạc', externalId: 'dothihoalac.vn', type: TargetType.WEBSITE, mode: TargetMode.API, metadata: { tags: ['owned', 'community'], priority: 2 } },
            { name: 'Group · CHECK IN HOALAC', externalId: 'check-in-hoalac', type: TargetType.FACEBOOK_GROUP, mode: TargetMode.MANUAL_CONFIRMATION, metadata: { tags: ['check-in', 'Hòa Lạc', 'cộng đồng'], priority: 1 } },
            { name: 'Cộng đồng · Sinh viên Hòa Lạc', externalId: 'student-community-demo', type: TargetType.FACEBOOK_GROUP, mode: TargetMode.MANUAL_CONFIRMATION, metadata: { tags: ['sinh viên', 'campus'], priority: 2 } },
            { name: 'Cộng đồng · Nhiếp ảnh Hòa Lạc', externalId: 'photo-community-demo', type: TargetType.FACEBOOK_GROUP, mode: TargetMode.MANUAL_CONFIRMATION, metadata: { tags: ['nhiếp ảnh', 'sáng tạo'], priority: 2 } },
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
      include: { publishJobs: { include: { target: true, contentVariant: true } } },
    });

    try {
      await this.queue.addBulk(
        run.publishJobs.map((publishJob) => ({
          name: publishJob.target.mode === TargetMode.API ? 'publish-authorized-target' : 'prepare-manual-target',
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
            backoff: publishJob.target.mode === TargetMode.API ? { type: 'exponential', delay: 3000 } : undefined,
            removeOnComplete: 200,
            removeOnFail: 500,
          },
        })),
      );
      await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.RUNNING } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue unavailable';
      await this.prisma.$transaction([
        this.prisma.campaignRun.update({ where: { id: run.id }, data: { status: RunStatus.FAILED, finishedAt: new Date() } }),
        this.prisma.publishJob.updateMany({ where: { runId: run.id }, data: { status: PublishJobStatus.FAILED, error: message } }),
      ]);
      throw new BadRequestException(`Could not queue campaign: ${message}`);
    }

    return {
      campaignId: campaign.id,
      runId: run.id,
      queued: run.publishJobs.length,
      apiTargets: run.publishJobs.filter((job) => job.target.mode === TargetMode.API).length,
      manualTargets: run.publishJobs.filter((job) => job.target.mode === TargetMode.MANUAL_CONFIRMATION).length,
      status: RunStatus.QUEUED,
    };
  }

  private async findRecord(identifier: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { OR: [{ id: identifier }, { slug: identifier }] } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async onModuleDestroy() {
    await Promise.all([this.queue.close(), this.prisma.$disconnect()]);
  }
}
