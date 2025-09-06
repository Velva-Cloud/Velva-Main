import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

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

    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'subscribe', planId } },
    });

    return sub;
  }
}