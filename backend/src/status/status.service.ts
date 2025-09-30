import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import IORedis from 'ioredis';
import { QueueService } from '../queue/queue.service';
import { AgentClientService } from '../servers/agent-client.service';

@Injectable()
export class StatusService {
  constructor(private prisma: PrismaService, private queues: QueueService, private agent: AgentClientService) {}

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

  async updatePlatform(includeDaemon = false) {
    // Call all approved nodes; if none, fall back to configured DAEMON_URL
    const nodes = await this.prisma.node.findMany({ where: { approved: true }, select: { apiUrl: true } });
    const urls = nodes.map(n => n.apiUrl).filter(Boolean) as string[];
    if (urls.length === 0 && process.env.DAEMON_URL) urls.push(process.env.DAEMON_URL);
    const results = [];
    for (const url of urls) {
      try {
        const r = await this.agent.platformUpdate(url, includeDaemon);
        results.push({ url, ok: true, restarted: r?.restarted || null });
      } catch (e: any) {
        results.push({ url, ok: false, error: e?.message || 'update_failed' });
      }
    }
    return { ok: results.some(r => r.ok), results };
  }
}