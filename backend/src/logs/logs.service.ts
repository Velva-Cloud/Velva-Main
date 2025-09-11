import { Injectable } from '@nestjs/common';
import { Prisma, LogAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LogFilters = {
  page?: number;
  pageSize?: number;
  action?: LogAction | string;
  q?: string; // search user email
  from?: Date;
  to?: Date;
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
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async listAll(filters: LogFilters = {}) {
    const page = clamp(filters.page ?? 1, 1, 100000);
    const pageSize = clamp(filters.pageSize ?? 20, 1, 100);
    const where: Prisma.LogWhereInput = {
      ...(filters.action ? { action: filters.action as LogAction } : {}),
      ...(filters.from || filters.to
        ? {
            timestamp: {
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
      this.prisma.log.count({ where }),
      this.prisma.log.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { id: true, email: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async listSupport(filters: LogFilters & { userId?: number; serverId?: number } = {}) {
    const page = clamp(filters.page ?? 1, 1, 100000);
    const pageSize = clamp(filters.pageSize ?? 20, 1, 100);
    const where: Prisma.LogWhereInput = {
      ...(filters.action ? { action: filters.action as LogAction } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.serverId
        ? { metadata: { path: ['serverId'], equals: filters.serverId } as any }
        : {}),
      ...(filters.from || filters.to
        ? {
            timestamp: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.log.count({ where }),
      this.prisma.log.findMany({
        where,
        orderBy: { id: 'desc' },
        include: { user: { select: { id: true, email: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async log(userId: number | null, action: 'login' | 'server_create' | 'plan_change', metadata?: any) {
    return this.prisma.log.create({
      data: { userId: userId ?? null, action, metadata: metadata ?? {} },
    });
  }
}