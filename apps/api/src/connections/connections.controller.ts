import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ConnectionsService,
  CreateConnectionInput,
  UpdateConnectionInput,
} from './connections.service';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list() {
    return this.connections.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.connections.findOne(id);
  }

  @Post()
  create(@Body() body: CreateConnectionInput) {
    return this.connections.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateConnectionInput) {
    return this.connections.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.connections.remove(id);
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.connections.test(id);
  }
}
