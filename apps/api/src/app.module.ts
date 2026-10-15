import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { ConnectionsController } from './connections/connections.controller';
import { ConnectionsService } from './connections/connections.service';

@Module({
  controllers: [HealthController, CampaignsController, ConnectionsController],
  providers: [CampaignsService, ConnectionsService],
})
export class AppModule {}
