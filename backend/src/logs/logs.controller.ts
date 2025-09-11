import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('logs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('logs')
export class LogsController {
  constructor(private service: LogsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list(@Query() query: any) {
    const filters = {
      action: query.action,
      q: query.q,
      from: query.from,
      to: query.to,
      page: Math.max(1, Math.min(100000, Number(query.page || 1))),
      pageSize: Math.max(1, Math.min(100, Number(query.pageSize || 20))),
    };
    return this.service.listAll(filters);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Roles(Role.ADMIN, Role.OWNER)
  async export(@Query() query: any) {
    const filters = {
      action: query.action,
      q: query.q,
      from: query.from,
      to: query.to,
      page: 1,
      pageSize: 100000,
    };
    const data = await this.service.listAll(filters);
    const rows = [
      ['id','userEmail','action','timestamp','metadata'],
      ...data.items.map((l: any) => [
        l.id,
        l.user?.email || '',
        l.action,
        new Date(l.timestamp).toISOString(),
        JSON.stringify(l.metadata || {}),
      ]),
    ];
    return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }
}