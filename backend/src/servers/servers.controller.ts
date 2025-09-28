import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';

@ApiTags('servers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('servers')
export class ServersController {
  constructor(private service: ServersService) {}

  @Get()
  async list(
    @Request() req: any,
    @Query()
    query: { all?: string; page?: string; pageSize?: string },
  ) {
    const user = req.user as { userId: number; role: Role };
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    if (query.all === '1' && (user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      return this.service.listAll(page, pageSize);
    }
    return this.service.listForUser(user.userId, page, pageSize);
  }

  @Get(':id')
  async getOne(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) return null;
    // Authorization: user can view own; support/admin/owner can view any
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      // hide existence
      return null;
    }
    return s;
  }

  @Post()
  async create(@Request() req: any, @Body() body: CreateServerDto) {
    const user = req.user as { userId: number };
    return this.service.create(user.userId, body.planId, body.name);
  }

  // Admin-only updates
  @Patch(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateServerDto) {
    return this.service.update(id, {
      name: body.name,
      status: body.status,
      planId: body.planId,
      nodeId: body.nodeId,
      userId: body.userId,
    });
  }

  // Support/Admin/Owner: set status running/stopped with optional reason
  @Patch(':id/status')
  async setStatus(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'running' | 'stopped'; reason?: string },
  ) {
    const actor = req.user as { userId: number; role: Role };
    if (!(actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER)) {
      throw new ForbiddenException();
    }
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.setStatus(id, body.status, actor.userId, body.reason);
  }

  // Admin-only delete
  @Delete(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }

  // Future daemon hooks (stubs)
  @Post(':id/provision')
  @Roles(Role.SUPPORT, Role.ADMIN, Role.OWNER)
  async provision(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const actor = req.user as { userId: number };
    return this.service.provision(id, actor.userId);
  }

  @Post(':id/start')
  async start(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    if (!(actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER)) {
      throw new ForbiddenException();
    }
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.start(id, actor.userId, body.reason);
  }

  @Post(':id/stop')
  async stop(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    if (!(actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER)) {
      throw new ForbiddenException();
    }
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.stop(id, actor.userId, body.reason);
  }

  @Post(':id/restart')
  async restart(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    if (!(actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER)) {
      throw new ForbiddenException();
    }
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.restart(id, actor.userId, body.reason);
  }

  @Post(':id/suspend')
  async suspend(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    if (!(actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER)) {
      throw new ForbiddenException();
    }
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.suspend(id, actor.userId, body.reason);
  }

  @Post(':id/unsuspend')
  async unsuspend(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    if (!(actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER)) {
      throw new ForbiddenException();
    }
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.unsuspend(id, actor.userId, body.reason);
  }
}