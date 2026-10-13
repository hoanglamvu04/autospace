import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';

@Module({
  controllers: [HealthController, CampaignsController],
  providers: [CampaignsService],
})
export class AppModule {}
