import { Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
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
  @Get('events')
  async sse(@Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const unsub = this.queues.onEvents((evt) => {
      try {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch {}
    });
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 25000);
    reqOnClose(res, () => {
      clearInterval(ping);
      unsub();
      try { res.end(); } catch {}
    });
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

// Helper to handle connection close across Express/Nest adapters
function reqOnClose(res: any, cb: () => void) {
  const req = res.req || res.request || undefined;
  if (req && typeof req.on === 'function') {
    req.on('close', cb);
    req.on('end', cb);
    req.on('error', cb);
  } else {
    res.on?.('close', cb);
  }
}