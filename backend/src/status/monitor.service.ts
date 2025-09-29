import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);
  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async markOffline() {
    const thresholdMs = Number(process.env.NODE_OFFLINE_THRESHOLD_MS || 120000); // 2 minutes
    const cutoff = new Date(Date.now() - thresholdMs);
    try {
      const result = await this.prisma.node.updateMany({
        where: { lastSeenAt: { lt: cutoff }, status: 'online' as any },
        data: { status: 'offline' as any },
      });
      if (result.count > 0) {
        this.logger.warn(`Marked ${result.count} node(s) offline due to missed heartbeat`);
      }
    } catch (e: any) {
      this.logger.warn(`markOffline failed: ${e?.message || e}`);
    }
  }
}