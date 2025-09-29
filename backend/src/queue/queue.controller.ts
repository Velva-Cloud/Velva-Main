import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { QueueService } from './queue.service';

@ApiTags('queues')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin/queues')
export class QueueController {
  constructor(private queues: QueueService) {}

  @Roles(Role.ADMIN, Role.OWNER)
  @Get()
  async listQueues() {
    return this.queues.listQueues();
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Get(':name/jobs')
  async listJobs(
    @Param('name') name: string,
    @Query('state') state: string = 'waiting',
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    return this.queues.listJobs(name, state, Number(page) || 1, Number(pageSize) || 20);
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Get(':name/:id')
  async getJob(@Param('name') name: string, @Param('id', ParseIntPipe) id: number) {
    return this.queues.getJob(name, id);
  }
}