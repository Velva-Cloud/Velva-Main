import { Injectable } from '@nestjs/common';
import { Prisma, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PageOpts = {
  page?: number;
  pageSize?: number;
};
type DateRange = { from?: Date; to?: Date };
type UserTxFilters = PageOpts &
  DateRange & {
    status?: TransactionStatus;
    gateway?: string;
    planId?: number;
  };
type AdminTxFilters = UserTxFilters & {
  q?: string; // search by user email
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async listForUser(userId: number, filters: UserTxFilters) {
    const page = clamp(filters.page ?? 1, 1, 100000);
    const pageSize = clamp(filters.pageSize ?? 20, 1, 100);
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.gateway ? { gateway: filters.gateway } : {}),
      ...(filters.planId ? { planId: filters.planId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          plan: { select: { id: true, name: true, pricePerMonth: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async listAll(filters: AdminTxFilters) {
    const page = clamp(filters.page ?? 1, 1, 100000);
    const pageSize = clamp(filters.pageSize ?? 20, 1, 100);
    const where: Prisma.TransactionWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.gateway ? { gateway: filters.gateway } : {}),
      ...(filters.planId ? { planId: filters.planId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
            },
          }
        : {}),
      ...(filters.q
        ? {
            user: {
              is: {
                email: { contains: filters.q },
              },
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { id: true, email: true } },
          plan: { select: { id: true, name: true, pricePerMonth: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }
}