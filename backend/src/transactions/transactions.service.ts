import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async listForUser(userId: number) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      include: {
        plan: { select: { id: true, name: true, pricePerMonth: true } },
      },
      take: 500,
    });
  }

  async listAll() {
    return this.prisma.transaction.findMany({
      orderBy: { id: 'desc' },
      include: {
        user: { select: { id: true, email: true } },
        plan: { select: { id: true, name: true, pricePerMonth: true } },
      },
      take: 500,
    });
  }
}