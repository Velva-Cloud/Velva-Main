import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async listAll() {
    return this.prisma.log.findMany({
      orderBy: { id: 'desc' },
      include: {
        user: { select: { id: true, email: true } },
      },
      take: 500,
    });
  }

  async log(userId: number | null, action: 'login' | 'server_create' | 'plan_change', metadata?: any) {
    return this.prisma.log.create({
      data: { userId: userId ?? null, action, metadata: metadata ?? {} },
    });
  }
}