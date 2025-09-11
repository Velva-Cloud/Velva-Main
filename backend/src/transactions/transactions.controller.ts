import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../common/roles.enum';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  async list(@Request() req: any, @Query('all') all?: string) {
    const user = req.user as { userId: number; role: Role };
    if (all === '1' && (user.role === Role.ADMIN || user.role === Role.OWNER)) {
      return this.service.listAll();
    }
    return this.service.listForUser(user.userId);
  }
}