import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  constructor(private prisma: PrismaService) {}

  // Daily retention job: audit logs 365d, server events 90d
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runRetention() {
    const now = new Date();
    const auditCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const eventCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    try {
      const [logs, events] = await this.prisma.$transaction([
        this.prisma.log.deleteMany({ where: { timestamp: { lt: auditCutoff } } }),
        this.prisma.serverEvent.deleteMany({ where: { createdAt: { lt: eventCutoff } } }),
      ]);
      this.logger.log(`Retention deleted: logs=${logs.count}, events=${events.count}`);
    } catch (e: any) {
      this.logger.warn(`Retention failed: ${e?.message || e}`);
    }
  }
}