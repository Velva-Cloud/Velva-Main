import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService, private mail: MailService) {}

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
    if (user) await this.mail.sendCanceled(user.email, plan?.name);

    return { canceled: true };
  }

  async create(userId: number, planId: number) {
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
    });

    // Record a mock successful transaction for this subscription
    await this.prisma.transaction.create({
      data: {
        userId,
        subscriptionId: sub.id,
        planId: plan.id,
        amount: plan.pricePerMonth as any,
        currency: 'USD',
        gateway: 'mock',
        status: 'success',
        metadata: { reason: 'initial_subscription' },
      },
    });

    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'subscribe', planId } },
    });

    // Send subscribed email
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) await this.mail.sendSubscribed(user.email, plan.name);

    return sub;
  }
}