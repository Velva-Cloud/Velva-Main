import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin/finance')
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async dashboard() {
    return this.finance.dashboard();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Roles(Role.ADMIN, Role.OWNER)
  async export() {
    const d = await this.finance.dashboard();
    const rows = [
      ['metric','value'],
      ['activeSubscribers', d.activeSubscribers],
      ['mrr', d.mrr],
      ['arr', d.arr],
      ['arpu', d.arpu],
      ['churn30', d.churn30],
      ['revenue30', d.revenue30],
      [],
      ['planId','planName','activeCount'],
      ...d.planDistribution.map((p) => [p.planId, p.planName, p.count]),
    ];
    return rows.map(r => r.length ? r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') : '').join('\n');
  }
}