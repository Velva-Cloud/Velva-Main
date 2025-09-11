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

@ApiTags('nodes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('nodes')
export class NodesController {
  constructor(private service: NodesService, private prisma: PrismaService) {}

  @Get()
  async list() {
    return this.service.list();
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