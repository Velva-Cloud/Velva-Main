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
    // Validate plan exists and is active to avoid FK violations
    const plan = await this.prisma.plan.findUnique({ where: { id: Number(planId) } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Invalid or inactive plan');
    }

    const server = await this.prisma.server.create({
      data: {
        userId,
        planId: plan.id,
        name,
        status: 'stopped',
      },
    });

    await this.prisma.log.create({
      data: { userId, action: 'server_create', metadata: { serverId: server.id, name, planId: plan.id } },
    });

    return server;
  }
}