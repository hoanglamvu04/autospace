import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CampaignsService,
  CreateCampaignInput,
  CreateContentInput,
  CreateTargetInput,
  UpdateCampaignInput,
} from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Post()
  create(@Body() body: CreateCampaignInput) {
    return this.campaigns.create(body);
  }

  @Post('bootstrap-demo')
  bootstrapDemo() {
    return this.campaigns.bootstrapDemo();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCampaignInput) {
    return this.campaigns.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaigns.remove(id);
  }

  @Post(':id/content')
  addContent(@Param('id') id: string, @Body() body: CreateContentInput) {
    return this.campaigns.addContent(id, body);
  }

  @Post(':id/targets')
  addTarget(@Param('id') id: string, @Body() body: CreateTargetInput) {
    return this.campaigns.addTarget(id, body);
  }

  @Delete(':id/targets/:targetId')
  deactivateTarget(@Param('id') id: string, @Param('targetId') targetId: string) {
    return this.campaigns.deactivateTarget(id, targetId);
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.campaigns.run(id);
  }
}
