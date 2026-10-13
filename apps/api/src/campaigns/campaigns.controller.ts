import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CampaignsService, RunCampaignInput } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get('demo')
  demo() {
    return {
      id: 'hola-halo',
      name: 'Hola Halo · Nhìn Hòa Lạc',
      status: 'DRAFT',
      targetCount: 3,
    };
  }

  @Post(':id/run')
  run(@Param('id') id: string, @Body() body: RunCampaignInput) {
    return this.campaigns.run(id, body);
  }
}
