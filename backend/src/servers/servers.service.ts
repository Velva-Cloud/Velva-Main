import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class ServersService {
  constructor(private prisma: PrismaService) {}

  async listForUser(userId: number, page = 1, pageSize = 20) {
    const p = clamp(page, 1, 100000);
    const ps = clamp(pageSize, 1, 100);
    const where = { userId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.server.count({ where }),
      this.prisma.server.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async listAll(page = 1, pageSize = 20) {
    const p = clamp(page, 1, 100000);
    const ps = clamp(pageSize, 1, 100);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.server.count(),
      this.prisma.server.findMany({ orderBy: { id: 'desc' }, skip: (p - 1) * ps, take: ps }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async create(userId: number, planId: number, name: string) {
    // Normalize and validate inputs (additional to DTO validation)
    const n = (name || '').trim();
    if (n.length < 3 || n.length > 32) {
      throw new BadRequestException('Name must be between 3 and 32 characters');
    }
    if (!/^[A-Za-z0-9_-]+$/.test(n)) {
      throw new BadRequestException('Name can only contain letters, numbers, dash and underscore');
    }

    // Validate plan exists and is active to avoid FK violations
    const plan = await this.prisma.plan.findUnique({ where: { id: Number(planId) } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Invalid or inactive plan');
    }

    // Validate user exists to avoid FK violation (e.g., stale session after DB reset)
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new BadRequestException('User not found. Please sign out and sign in again.');
    }

    // Optional uniqueness by user to avoid confusion
    const existsByName = await this.prisma.server.findFirst({
      where: { userId, name: n },
      select: { id: true },
    });
    if (existsByName) {
      throw new BadRequestException('You already have a server with that name');
    }

    const server = await this.prisma.server.create({
      data: {
        userId,
        planId: plan.id,
        name: n,
        status: 'stopped',
      },
    });

    await this.prisma.log.create({
      data: { userId, action: 'server_create', metadata: { serverId: server.id, name: n, planId: plan.id } },
    });

    return server;
  }
}