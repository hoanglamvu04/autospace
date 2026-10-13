import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Job, Worker } from 'bullmq';
import {
  PublishJobStatus,
  RunStatus,
  TargetMode,
  createPrismaClient,
} from '@autospace/database';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env'), override: false });

const prisma = createPrismaClient();
const connection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

type DistributionJobData = {
  campaignId: string;
  runId: string;
  publishJobId: string;
  targetId: string;
  contentVariantId: string | null;
  mode: TargetMode;
};

async function finalizePreparation(runId: string) {
  const pending = await prisma.publishJob.count({
    where: {
      runId,
      status: { in: [PublishJobStatus.QUEUED, PublishJobStatus.RUNNING] },
    },
  });

  if (pending > 0) return;

  const failed = await prisma.publishJob.count({
    where: { runId, status: PublishJobStatus.FAILED },
  });

  await prisma.campaignRun.update({
    where: { id: runId },
    data: {
      status: failed > 0 ? RunStatus.FAILED : RunStatus.PREPARED,
      finishedAt: new Date(),
    },
  });
}

const worker = new Worker(
  'campaign-distribution',
  async (job: Job<DistributionJobData>) => {
    const data = job.data;
    const run = await prisma.campaignRun.findUnique({ where: { id: data.runId } });

    await prisma.$transaction([
      prisma.publishJob.update({
        where: { id: data.publishJobId },
        data: {
          status: PublishJobStatus.RUNNING,
          error: null,
          bullJobId: String(job.id ?? data.publishJobId),
        },
      }),
      prisma.campaignRun.update({
        where: { id: data.runId },
        data: {
          status: RunStatus.RUNNING,
          startedAt: run?.startedAt ?? new Date(),
        },
      }),
    ]);

    if (job.name === 'prepare-manual-target' || data.mode === TargetMode.MANUAL_CONFIRMATION) {
      await prisma.publishJob.update({
        where: { id: data.publishJobId },
        data: { status: PublishJobStatus.AWAITING_CONFIRMATION },
      });
      await finalizePreparation(data.runId);
      return { status: PublishJobStatus.AWAITING_CONFIRMATION, targetId: data.targetId };
    }

    // Provider adapters are connected in the next integration layer. Until a
    // channel has valid credentials, the job stops here instead of pretending
    // that a post was published successfully.
    await prisma.publishJob.update({
      where: { id: data.publishJobId },
      data: { status: PublishJobStatus.READY_FOR_PROVIDER },
    });
    await finalizePreparation(data.runId);

    return { status: PublishJobStatus.READY_FOR_PROVIDER, targetId: data.targetId };
  },
  { connection, concurrency: 5 },
);

worker.on('completed', (job, result) => {
  console.log(`[worker] job=${job.id} completed`, result);
});

worker.on('failed', async (job, error) => {
  console.error(`[worker] job=${job?.id ?? 'unknown'} failed`, error.message);
  if (!job?.data?.publishJobId) return;

  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return;

  try {
    await prisma.publishJob.update({
      where: { id: job.data.publishJobId },
      data: { status: PublishJobStatus.FAILED, error: error.message },
    });
    await finalizePreparation(job.data.runId);
  } catch (persistError) {
    console.error('[worker] could not persist failed state', persistError);
  }
});

async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

console.log('AutoSpace worker started: campaign-distribution');
