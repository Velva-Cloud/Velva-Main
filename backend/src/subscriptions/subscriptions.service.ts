import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService, @Optional() private mail?: MailService) {}

  async getCurrent(userId: number) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      orderBy: { id: 'desc' },
      include: { plan: true },
    });
  }

  async cancel(userId: number) {
    const current = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      orderBy: { id: 'desc' },
    });
    if (!current) {
      throw new BadRequestException('No active subscription to cancel');
    }
    await this.prisma.subscription.update({
      where: { id: current.id },
      data: { status: 'canceled', endDate: new Date() },
    });
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'cancel', subscriptionId: current.id, planId: current.planId } },
    });

    // Send cancellation email
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const plan = await this.prisma.plan.findUnique({ where: { id: current.planId } });
    if (user && this.mail) await this.mail.sendCanceled(user.email, plan?.name);

    return { canceled: true };
  }

  async create(userId: number, planId: number, opts?: { customRamGB?: number }) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new BadRequestException('Invalid plan');

    // Cancel any existing active subscription
    await this.prisma.subscription.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'canceled', endDate: new Date() },
    });

    const sub = await this.prisma.subscription.create({
      data: {
        userId,
        planId,
        startDate: new Date(),
        status: 'active',
      },
      select: { id: true, planId: true, startDate: true, status: true },
    });

    // Determine amount in GBP
    const resources: any = plan.resources || {};
    const ramRange = resources?.ramRange as { minMB?: number; maxMB?: number } | undefined;
    const pricePerGB = typeof resources?.pricePerGB === 'number' ? resources.pricePerGB : undefined;
    let amountStr = String(plan.pricePerMonth);
    const metadata: any = { reason: 'initial_subscription' };

    if (ramRange && pricePerGB !== undefined) {
      const customGB = Number(opts?.customRamGB ?? 0);
      const minGB = ramRange.minMB ? Math.round(ramRange.minMB / 1024) : 0;
      const maxGB = ramRange.maxMB ? Math.round(ramRange.maxMB / 1024) : 0;
      if (!customGB || customGB < minGB || customGB > maxGB) {
        throw new BadRequestException(`Please choose a RAM size between ${minGB} and ${maxGB} GB`);
      }
      const amount = pricePerGB * customGB;
      amountStr = amount.toFixed(2);
      metadata.customRamGB = customGB;
      metadata.pricePerGB = pricePerGB;
    }

    // Record a mock successful transaction for this subscription
    await this.prisma.transaction.create({
      data: {
        userId,
        subscriptionId: sub.id,
        planId: plan.id,
        amount: amountStr as any,
        currency: 'GBP',
        gateway: 'mock',
        status: 'success',
        metadata,
      },
    });

    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'subscribe', planId } },
    });

    // Send subscribed email
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && this.mail) await this.mail.sendSubscribed(user.email, plan.name);

    return sub;
  }
}