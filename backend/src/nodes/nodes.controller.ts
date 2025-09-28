import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { PkiService } from '../common/pki.service';
import * as crypto from 'crypto';

@ApiTags('nodes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('nodes')
export class NodesController {
  constructor(private service: NodesService, private prisma: PrismaService, private pki: PkiService) {}

  @Get()
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('pending') pending?: string) {
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 20;
    const onlyPending = pending === '1';
    return this.service.list(p, ps, onlyPending);
  }

  // Admin: create node
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post()
  async create(@Body() dto: CreateNodeDto, @Req() req: any) {
    const node = await this.service.create(dto);
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'node_create', nodeId: node.id } },
    });
    return node;
  }

  // Admin: generate one-time join code
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post('join-codes')
  async generateJoinCode(@Body() body: { ttlMinutes?: number }, @Req() req: any) {
    const ttl = Math.min(1440, Math.max(1, Number(body?.ttlMinutes || 15))); // 1..1440 minutes
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);
    const raw = crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 hex chars
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;

    const rec = await this.prisma.nodeJoinCode.create({
      data: {
        code,
        expiresAt,
        createdById: req?.user?.userId ?? null,
      },
    });

    await this.prisma.log.create({
      data: { userId: req?.user?.userId ?? null, action: 'plan_change', metadata: { event: 'join_code_create', code: rec.code, expiresAt } },
    });

    return { code: rec.code, expiresAt: rec.expiresAt.toISOString() };
  }

  // Admin: list join codes
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Get('join-codes')
  async listJoinCodes(@Query('includeUsed') includeUsed?: string) {
    const now = new Date();
    const where: Prisma.NodeJoinCodeWhereInput = includeUsed === '1' ? {} : { used: false, expiresAt: { gt: now } };
    const items = await this.prisma.nodeJoinCode.findMany({ where, orderBy: { id: 'desc' }, take: 100 });
    return { items };
  }

  // Admin: revoke a join code
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Delete('join-codes/:code')
  async revokeJoinCode(@Param('code') code: string, @Req() req: any) {
    const jc = await this.prisma.nodeJoinCode.findUnique({ where: { code } });
    if (!jc) return { ok: true };
    await this.prisma.nodeJoinCode.update({
      where: { code },
      data: { used: true, usedAt: new Date() },
    });
    await this.prisma.log.create({
      data: { userId: req?.user?.userId ?? null, action: 'plan_change', metadata: { event: 'join_code_revoke', code } },
    });
    return { ok: true };
  }

  // Admin: approve a pending node (sign CSR and mark approved)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new Error('Node not found');
    if (!node.csrPem) throw new Error('No CSR on file for this node');
    const certPem = this.pki.signCsr(node.csrPem);
    const updated = await this.prisma.node.update({
      where: { id },
      data: { approved: true, nodeCertPem: certPem },
    });
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'node_approve', nodeId: id } },
    });
    return updated;
  }

  // Admin: deny (delete) a pending node
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post(':id/deny')
  async deny(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const res = await this.service.delete(id);
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'node_deny', nodeId: id } },
    });
    return res;
  }

  // Admin: update node
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNodeDto, @Req() req: any) {
    const updated = await this.service.update(id, dto);
    const userId = req?.user?.userId ?? null;

    const metaPatch = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Prisma.JsonObject;

    await this.prisma.log.create({
      data: {
        userId,
        action: 'plan_change',
        metadata: { event: 'node_update', nodeId: id, patch: metaPatch } as Prisma.InputJsonValue,
      },
    });
    return updated;
  }

  // Admin: toggle status online/offline
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch(':id/toggle')
  async toggle(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const toggled = await this.service.toggle(id);
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'node_toggle', nodeId: id, status: toggled.status } },
    });
    return toggled;
  }

  // Admin: delete node
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const result = await this.service.delete(id);
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'node_delete', nodeId: id } },
    });
    return result;
  }

  // Admin: ping node
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Get(':id/ping')
  async ping(@Param('id', ParseIntPipe) id: number, @Query('port') port?: string, @Query('timeout') timeout?: string) {
    const p = port ? Number(port) : 80;
    const t = timeout ? Number(timeout) : 1500;
    return this.service.ping(id, p, t);
  }
}