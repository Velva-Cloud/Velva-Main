import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import IORedis from 'ioredis';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class StatusService {
  constructor(private prisma: PrismaService, private queues: QueueService) {}

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

    // Redis status
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
    let redisOk = false;
    let redisMsg = 'Redis not configured';
    if (redisUrl) {
      try {
        const client = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
        await client.connect();
        const pong = await client.ping();
        redisOk = pong?.toLowerCase?.() === 'pong';
        redisMsg = redisOk ? 'OK' : 'Ping failed';
        await client.quit();
      } catch (e: any) {
        redisOk = false;
        redisMsg = e?.message || 'Connection error';
      }
    }

    // Queue status
    const queueOk = this.queues.isReady();
    const queueMsg = queueOk ? 'Workers ready' : 'Not initialized';

    return {
      db: { ok: dbOk },
      redis: { configured: !!redisUrl, ok: redisOk, message: redisMsg },
      queue: { ok: queueOk, message: queueMsg },
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}