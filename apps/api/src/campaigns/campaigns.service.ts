import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

type TargetMode = 'API' | 'MANUAL_CONFIRMATION';

type RunTarget = {
  id: string;
  mode: TargetMode;
};

export type RunCampaignInput = {
  targets?: RunTarget[];
};

@Injectable()
export class CampaignsService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor() {
    const password = process.env.REDIS_PASSWORD || undefined;
    this.queue = new Queue('campaign-distribution', {
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password,
      },
    });
  }

  async run(campaignId: string, input: RunCampaignInput) {
    const targets = input.targets ?? [];

    await Promise.all(
      targets.map((target) =>
        this.queue.add(
          target.mode === 'API' ? 'publish-authorized-target' : 'prepare-manual-target',
          {
            campaignId,
            targetId: target.id,
            mode: target.mode,
          },
          {
            attempts: target.mode === 'API' ? 3 : 1,
            backoff: target.mode === 'API' ? { type: 'exponential', delay: 3000 } : undefined,
            removeOnComplete: 200,
            removeOnFail: 500,
          },
        ),
      ),
    );

    return {
      campaignId,
      queued: targets.length,
      apiTargets: targets.filter((target) => target.mode === 'API').length,
      manualTargets: targets.filter((target) => target.mode === 'MANUAL_CONFIRMATION').length,
      status: 'QUEUED',
    };
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
