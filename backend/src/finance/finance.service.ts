import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async dashboard() {
    // Active subscribers and MRR
    const activeSubs = await this.prisma.subscription.findMany({
      where: { status: 'active' },
      include: { plan: true },
    });
    const activeCount = activeSubs.length;
    const mrr = activeSubs.reduce((sum, s) => sum + Number(s.plan.pricePerMonth), 0);
    const arr = mrr * 12;
    const arpu = activeCount > 0 ? mrr / activeCount : 0;

    // Churn: canceled in last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const churnCount = await this.prisma.subscription.count({
      where: { status: 'canceled', endDate: { gte: since } },
    });

    // Revenue last 30 days (successful transactions)
    const revenueTx = await this.prisma.transaction.findMany({
      where: { status: 'success', createdAt: { gte: since } },
      select: { amount: true },
    });
    const revenue30 = revenueTx.reduce((sum, t) => sum + Number(t.amount), 0);

    // Plan distribution among active subscribers
    const planDistributionRaw = await this.prisma.subscription.groupBy({
      by: ['planId'],
      _count: { planId: true },
      where: { status: 'active' },
    });
    const planIds = planDistributionRaw.map((r) => r.planId);
    const plans = await this.prisma.plan.findMany({ where: { id: { in: planIds } } });
    const planMap = new Map(plans.map((p) => [p.id, p.name]));
    const planDistribution = planDistributionRaw.map((r) => ({
      planId: r.planId,
      planName: planMap.get(r.planId) || `Plan #${r.planId}`,
      count: r._count.planId,
    }));

    return {
      activeSubscribers: activeCount,
      mrr,
      arr,
      arpu,
      churn30: churnCount,
      revenue30,
      planDistribution,
    };
  }
}