import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatusService {
  constructor(private prisma: PrismaService) {}

  async getSystemStatus() {
    // DB status
    let dbOk = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
    const redis = {
      configured: !!redisUrl,
      ok: false,
      message: redisUrl ? 'Redis integration not configured in this MVP' : 'Redis not configured',
    };

    const queue = {
      ok: false,
      message: 'Queue not configured in this MVP',
    };

    return {
      db: { ok: dbOk },
      redis,
      queue,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}