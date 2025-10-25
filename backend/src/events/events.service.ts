import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async list(params: {
    serverId?: number;
    from?: Date;
    to?: Date;
    type?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Math.min(100000, Number(params.page || 1)));
    const pageSize = Math.max(1, Math.min(1000, Number(params.pageSize || 100)));
    const where: any = {
      ...(params.serverId ? { serverId: Number(params.serverId) } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.serverEvent.count({ where }),
      this.prisma.serverEvent.findMany({
        where,
        orderBy: { id: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  maskEmail(email: string) {
    const [user, domain] = email.split('@');
    const maskedUser = user.length <= 2 ? '*'.repeat(user.length) : user[0] + '*'.repeat(user.length - 2) + user[user.length - 1];
    return `${maskedUser}@${domain}`;
  }

  // Export as CSV or JSON (mask PII by default)
  async export(format: 'json' | 'csv', params: { from?: Date; to?: Date; includePII?: boolean }) {
    const where: any = {
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const items = await this.prisma.serverEvent.findMany({
      where,
      orderBy: { id: 'desc' },
      include: { server: true, user: { select: { email: true } } },
      take: 10000,
    });

    if (format === 'json') {
      const out = items.map(it => ({
        id: it.id,
        serverId: it.serverId,
        type: it.type,
        message: it.message,
        data: it.data,
        createdAt: it.createdAt,
        userEmail: params.includePII ? it.user?.email || null : (it.user?.email ? this.maskEmail(it.user.email) : null),
      }));
      return { contentType: 'application/json', body: JSON.stringify(out, null, 2) };
    }

    // CSV
    const rows = [
      ['id', 'serverId', 'type', 'message', 'createdAt', 'userEmail'].join(','),
      ...items.map(it =>
        [
          it.id,
          it.serverId,
          `"${(it.type || '').replace(/"/g, '""')}"`,
          `"${(it.message || '').replace(/"/g, '""')}"`,
          it.createdAt.toISOString(),
          `"${params.includePII ? (it.user?.email || '') : (it.user?.email ? this.maskEmail(it.user.email) : '')}"`,
        ].join(','),
      ),
    ];
    return { contentType: 'text/csv', body: rows.join('\n') };
  }
}