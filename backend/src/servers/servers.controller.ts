import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
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
    // Authorization: user can view own; support/admin/owner can view any; server-level access can view
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar) return null;
    }
    return s;
  }

  // Console logs SSE proxy
  @Get(':id/logs')
  async logs(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Res() res: any) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) return res.status(404).end();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar) return res.status(403).end();
    }
    return this.service.streamLogs(id, res);
  }

  // Exec command inside container (best-effort)
  @Post(':id/exec')
  async exec(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { cmd: string }) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) throw new ForbiddenException();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar || (ar !== 'OPERATOR' && ar !== 'ADMIN')) throw new ForbiddenException();
    }
    return this.service.exec(id, body.cmd || '');
  }

  // File manager
  @Get(':id/fs/list')
  async fsList(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('path') path = '/') {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) throw new ForbiddenException();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar) throw new ForbiddenException();
    }
    return this.service.fsList(id, path);
  }

  @Get(':id/fs/download')
  async fsDownload(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('path') path = '/', @Res() res: any) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) return res.status(404).end();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar) return res.status(403).end();
    }
    return this.service.fsDownload(id, path, res);
  }

  @Post(':id/fs/upload')
  async fsUpload(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('path') path = '/', @Body() body: { filename: string; contentBase64: string }) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) throw new ForbiddenException();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar || (ar !== 'OPERATOR' && ar !== 'ADMIN')) throw new ForbiddenException();
    }
    const buf = Buffer.from(body.contentBase64 || '', 'base64');
    return this.service.fsUpload(id, path, body.filename || 'upload.bin', buf);
  }

  @Post(':id/fs/mkdir')
  async fsMkdir(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { path: string }) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) throw new ForbiddenException();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar || (ar !== 'OPERATOR' && ar !== 'ADMIN')) throw new ForbiddenException();
    }
    return this.service.fsMkdir(id, body.path || '/');
  }

  @Post(':id/fs/delete')
  async fsDelete(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { path: string }) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) throw new ForbiddenException();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar || (ar !== 'OPERATOR' && ar !== 'ADMIN')) throw new ForbiddenException();
    }
    return this.service.fsDelete(id, body.path || '/');
  }

  @Post(':id/fs/rename')
  async fsRename(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { from: string; to: string }) {
    const user = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) throw new ForbiddenException();
    if (s.userId !== user.userId && !(user.role === Role.SUPPORT || user.role === Role.ADMIN || user.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, user.userId);
      if (!ar || (ar !== 'OPERATOR' && ar !== 'ADMIN')) throw new ForbiddenException();
    }
    return this.service.fsRename(id, body.from || '/', body.to || '/');
  }

  @Post()
  async create(@Request() req: any, @Body() body: CreateServerDto) {
    const user = req.user as { userId: number };
    return this.service.create(user.userId, body.planId, body.name, body.image);
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

  // Support/Admin/Owner or server-level ADMIN: set status running/stopped with optional reason
  @Patch(':id/status')
  async setStatus(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'running' | 'stopped'; reason?: string },
  ) {
    const actor = req.user as { userId: number; role: Role };
    let allowed = actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER;
    if (!allowed) {
      const s = await this.service.getById(id);
      if (s) {
        if (s.userId === actor.userId) allowed = true;
        else {
          const ar = await this.service.getAccessRole(id, actor.userId);
          if (ar === 'ADMIN') allowed = true;
        }
      }
    }
    if (!allowed) throw new ForbiddenException();
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

  // Provision
  @Post(':id/provision')
  async provision(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const actor = req.user as { userId: number; role: Role };
    let allowed = actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER;
    if (!allowed) {
      const s = await this.service.getById(id);
      if (s) {
        if (s.userId === actor.userId) allowed = true;
        else {
          const ar = await this.service.getAccessRole(id, actor.userId);
          if (ar === 'ADMIN') allowed = true;
        }
      }
    }
    if (!allowed) throw new ForbiddenException();
    return this.service.provision(id, actor.userId);
  }

  @Post(':id/start')
  async start(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    let allowed = actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER;
    if (!allowed) {
      const s = await this.service.getById(id);
      if (s) {
        if (s.userId === actor.userId) allowed = true;
        else {
          const ar = await this.service.getAccessRole(id, actor.userId);
          if (ar === 'ADMIN') allowed = true;
        }
      }
    }
    if (!allowed) throw new ForbiddenException();
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.start(id, actor.userId, body.reason);
  }

  @Post(':id/stop')
  async stop(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    let allowed = actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER;
    if (!allowed) {
      const s = await this.service.getById(id);
      if (s) {
        if (s.userId === actor.userId) allowed = true;
        else {
          const ar = await this.service.getAccessRole(id, actor.userId);
          if (ar === 'ADMIN') allowed = true;
        }
      }
    }
    if (!allowed) throw new ForbiddenException();
    if (actor.role === Role.SUPPORT && (!body.reason || !body.reason.trim())) {
      throw new BadRequestException('Reason is required for support actions');
    }
    return this.service.stop(id, actor.userId, body.reason);
  }

  @Post(':id/restart')
  async restart(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: string }) {
    const actor = req.user as { userId: number; role: Role };
    let allowed = actor.role === Role.SUPPORT || actor.role === Role.ADMIN || actor.role === Role.OWNER;
    if (!allowed) {
      const s = await this.service.getById(id);
      if (s) {
        if (s.userId === actor.userId) allowed = true;
        else {
          const ar = await this.service.getAccessRole(id, actor.userId);
          if (ar === 'ADMIN') allowed = true;
        }
      }
    }
    if (!allowed) throw new ForbiddenException();
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

  // Server access management
  @Get(':id/access')
  async accessList(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const actor = req.user as { userId: number; role: Role };
    const s = await this.service.getById(id);
    if (!s) throw new ForbiddenException();
    // Owner/global admin/owner can view; users with server access can also view
    if (s.userId !== actor.userId && !(actor.role === Role.ADMIN || actor.role === Role.OWNER)) {
      const ar = await this.service.getAccessRole(id, actor.userId);
      if (!ar) throw new ForbiddenException();
    }
    return this.service.listAccess(id);
  }

  @Post(':id/access')
  async addAccess(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { email: string; role: 'VIEWER' | 'OPERATOR' | 'ADMIN' }) {
    const actor = req.user as { userId: number; role: Role };
    return this.service.addAccess(id, actor.userId, (body.email || '').trim(), body.role);
  }

  @Patch(':id/access/:userId')
  async updateAccess(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number, @Body() body: { role: 'VIEWER' | 'OPERATOR' | 'ADMIN' }) {
    const actor = req.user as { userId: number; role: Role };
    return this.service.updateAccess(id, actor.userId, userId, body.role);
  }

  @Delete(':id/access/:userId')
  async removeAccess(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    const actor = req.user as { userId: number; role: Role };
    return this.service.removeAccess(id, actor.userId, userId);
  }
}