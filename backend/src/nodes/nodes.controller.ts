import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

@ApiTags('nodes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('nodes')
export class NodesController {
  constructor(private service: NodesService) {}

  @Get()
  async list() {
    return this.service.list();
  }

  // Admin: create node
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post()
  async create(@Body() dto: CreateNodeDto) {
    return this.service.create(dto);
  }

  // Admin: update node
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNodeDto) {
    return this.service.update(id, dto);
  }

  // Admin: toggle status online/offline
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch(':id/toggle')
  async toggle(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggle(id);
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