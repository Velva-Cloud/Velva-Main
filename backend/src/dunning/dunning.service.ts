import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(private prisma: PrismaService, private mail: MailService, private settings: SettingsService) {}

  // Runs hourly to enforce grace period expiry
  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    const now = new Date();
    // Find subscriptions that are past_due and graceUntil has passed
    const pastDue = await this.prisma.subscription.findMany({
      where: {
        status: 'past_due',
        graceUntil: { lte: now },
      },
      include: { user: true, plan: true },
    });

    for (const s of pastDue) {
      await this.prisma.subscription.update({
        where: { id: s.id },
        data: { status: 'canceled', endDate: now },
      });

      await this.prisma.log.create({
        data: {
          userId: s.userId,
          action: 'plan_change',
          metadata: { event: 'auto_cancel_due_to_non_payment', subscriptionId: s.id, planId: s.planId },
        },
      });

      // Email notice
      await this.mail.sendCanceled(s.user.email, s.plan?.name || undefined);
    }
  }

  // Helper to mark a user's active subscription as past_due with grace period
  async markPastDue(userId: number) {
    const active = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      orderBy: { id: 'desc' },
      include: { plan: true, user: true },
    });
    if (!active) return;

    const billing = await this.settings.getBilling();
    const graceDays = billing?.graceDays ?? 3;

    const until = new Date();
    until.setDate(until.getDate() + graceDays);

    await this.prisma.subscription.update({
      where: { id: active.id },
      data: { status: 'past_due', graceUntil: until },
    });

    await this.prisma.log.create({
      data: {
        userId,
        action: 'plan_change',
        metadata: { event: 'mark_past_due', subscriptionId: active.id, planId: active.planId, graceUntil: until.toISOString() },
      },
    });

    // Send payment failed email (already sent by Stripe service), optionally could send a dedicated past_due notice.
    await this.mail.sendPaymentFailed(active.user.email, active.plan?.name);
  }
}