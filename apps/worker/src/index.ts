import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Job, Worker } from 'bullmq';

config({ path: resolve(process.cwd(), '../../.env') });

const connection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

const worker = new Worker(
  'campaign-distribution',
  async (job: Job) => {
    const { campaignId, targetId, mode } = job.data as {
      campaignId: string;
      targetId: string;
      mode: 'API' | 'MANUAL_CONFIRMATION';
    };

    if (job.name === 'prepare-manual-target' || mode === 'MANUAL_CONFIRMATION') {
      console.log(`[manual] campaign=${campaignId} target=${targetId} queued for confirmation`);
      return { status: 'AWAITING_CONFIRMATION', targetId };
    }

    // Provider integration will live here. Only authorized API channels are allowed
    // to reach the automatic publish adapters.
    console.log(`[api] campaign=${campaignId} target=${targetId} ready for provider adapter`);
    return { status: 'READY_FOR_PROVIDER', targetId };
  },
  { connection, concurrency: 5 },
);

worker.on('completed', (job, result) => {
  console.log(`[worker] job=${job.id} completed`, result);
});

worker.on('failed', (job, error) => {
  console.error(`[worker] job=${job?.id ?? 'unknown'} failed`, error.message);
});

async function shutdown() {
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

console.log('AutoSpace worker started: campaign-distribution');
