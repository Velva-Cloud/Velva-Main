import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin/events')
export class EventsController {
  constructor(private events: EventsService) {}

  @Roles(Role.ADMIN, Role.OWNER)
  @Get()
  async list(
    @Query('serverId') serverId?: string,
    @Query('type') type?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    const page = Number(pageStr) || 1;
    const pageSize = Number(pageSizeStr) || 100;
    return this.events.list({ serverId: serverId ? Number(serverId) : undefined, type, from, to, page, pageSize });
  }

  @Roles(Role.ADMIN, Role.OWNER)
  @Get('export')
  async export(
    @Res() res: any,
    @Query('format') format: 'json' | 'csv' = 'json',
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('includePII') includePIIStr?: string,
  ) {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    const includePII = includePIIStr === '1' || includePIIStr === 'true';
    const out = await this.events.export(format, { from, to, includePII });
    res.setHeader('Content-Type', out.contentType);
    res.send(out.body);
  }
}