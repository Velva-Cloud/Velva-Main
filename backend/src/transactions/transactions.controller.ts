import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../common/roles.enum';
import { TransactionStatus } from '@prisma/client';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  async list(
    @Request() req: any,
    @Query()
    query: {
      all?: string;
      page?: string;
      pageSize?: string;
      status?: TransactionStatus | string;
      gateway?: string;
      planId?: string;
      q?: string;
      from?: string;
      to?: string;
    },
  ) {
    const user = req.user as { userId: number; role: Role };

    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const planId = query.planId ? Number(query.planId) : undefined;
    const status = query.status as TransactionStatus | undefined;
    const gateway = query.gateway || undefined;
    const q = query.q || undefined;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (query.all === '1' && (user.role === Role.ADMIN || user.role === Role.OWNER)) {
      return this.service.listAll({ page, pageSize, status, gateway, planId, q, from, to });
    }
    return this.service.listForUser(user.userId, { page, pageSize, status, gateway, planId, from, to });
  }
}