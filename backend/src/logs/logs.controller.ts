import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { LogAction } from '@prisma/client';

@ApiTags('logs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('logs')
export class LogsController {
  constructor(private service: LogsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list(
    @Query()
    query: {
      page?: string;
      pageSize?: string;
      action?: LogAction | string;
      q?: string;
      from?: string;
      to?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const action = query.action || undefined;
    const q = query.q || undefined;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return this.service.listAll({ page, pageSize, action, q, from, to });
  }
}