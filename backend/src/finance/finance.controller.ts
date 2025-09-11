import { Controller, Get, UseGuards } from '@nestjs/common';
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
}