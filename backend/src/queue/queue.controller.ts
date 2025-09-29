import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
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

  // Admin actions
  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':name/:id/retry')
  async retry(@Param('name') name: string, @Param('id', ParseIntPipe) id: number) {
    return this.queues.retryJob(name, id);
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':name/:id/remove')
  async remove(@Param('name') name: string, @Param('id', ParseIntPipe) id: number) {
    return this.queues.removeJob(name, id);
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':name/:id/promote')
  async promote(@Param('name') name: string, @Param('id', ParseIntPipe) id: number) {
    return this.queues.promoteJob(name, id);
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':name/pause')
  async pause(@Param('name') name: string) {
    return this.queues.pauseQueue(name);
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':name/resume')
  async resume(@Param('name') name: string) {
    return this.queues.resumeQueue(name);
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':name/drain')
  async drain(@Param('name') name: string) {
    return this.queues.drainQueue(name);
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':name/clean')
  async clean(@Param('name') name: string, @Query('state') state: 'completed' | 'failed' = 'completed') {
    return this.queues.cleanQueue(name, state);
  }
}