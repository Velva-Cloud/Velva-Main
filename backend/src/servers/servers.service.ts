import { Injectable } from '@nestjs/common';
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
    // For MVP Phase 1: no plan limits, simple creation
    const server = await this.prisma.server.create({
      data: {
        userId,
        planId,
        name,
        status: 'stopped',
      },
    });

    await this.prisma.log.create({
      data: { userId, action: 'server_create', metadata: { serverId: server.id, name } },
    });

    return server;
  }
}