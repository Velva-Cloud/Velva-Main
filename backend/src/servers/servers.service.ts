import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServersService {
  constructor(private prisma: PrismaService) {}

  async listForUser(userId: number) {
    return this.prisma.server.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
    });
  }

  async listAll() {
    return this.prisma.server.findMany({ orderBy: { id: 'desc' } });
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