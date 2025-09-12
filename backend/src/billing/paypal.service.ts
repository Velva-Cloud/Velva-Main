import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';

function getPaypalEnvironment() {
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const secret = process.env.PAYPAL_CLIENT_SECRET || '';
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  if (!clientId || !secret) return null;
  return env === 'live'
    ? new paypal.core.LiveEnvironment(clientId, secret)
    : new paypal.core.SandboxEnvironment(clientId, secret);
}

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);
  private readonly client: paypal.core.PayPalHttpClient | null;

  constructor(private prisma: PrismaService, private mail: MailService, private settings: SettingsService) {
    const environment = getPaypalEnvironment();
    if (!environment) {
      this.logger.warn('PAYPAL_CLIENT_ID/SECRET not set. PayPal features will not work.');
      this.client = null;
    } else {
      this.client = new paypal.core.PayPalHttpClient(environment);
    }
  }

  private ensureConfigured() {
    if (!this.client) throw new BadRequestException('PayPal is not configured');
  }

  // Ensure PayPal Product and Plan exist for a fixed-price plan
  // Returns { planId: string }
  async ensurePlan(planId: number) {
    this.ensureConfigured();

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Invalid or inactive plan');
    }
    const resources: any = plan.resources || {};
    if (resources?.ramRange) {
      // Simplicity: not supporting per-GB custom RAM on PayPal in this pass
      throw new BadRequestException('PayPal is not supported for custom RAM plans yet. Use Stripe.');
    }

    let paypalProductId = resources.paypalProductId as string | undefined;
    let paypalPlanId = resources.paypalPlanId as string | undefined;

    // Create Product if missing
    if (!paypalProductId) {
      const req = new paypal.catalogs.products.ProductsCreateRequest();
      req.requestBody({
        name: plan.name,
        type: 'SERVICE',
      } as any);
      const res = await this.client!.execute(req);
      paypalProductId = res.result.id;
    }

    // Create Plan if missing
    if (!paypalPlanId) {
      const amount = Number(plan.pricePerMonth);
      if (!amount || amount <= 0) throw new BadRequestException('Plan price invalid for PayPal');
      const createPlanReq = new paypal.subscriptions.PlansCreateRequest();
      createPlanReq.requestBody({
        product_id: paypalProductId,
        name: `${plan.name} Monthly`,
        status: 'ACTIVE',
        billing_cycles: [
          {
            frequency: { interval_unit: 'MONTH', interval_count: 1 },
            tenure_type: 'REGULAR',
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: { fixed_price: { currency_code: 'GBP', value: amount.toFixed(2) } },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee_failure_action: 'CANCEL',
          payment_failure_threshold: 1,
        },
      } as any);
      const planRes = await this.client!.execute(createPlanReq);
      paypalPlanId = planRes.result.id;
    }

    const nextResources = { ...resources, paypalProductId, paypalPlanId };
    if (JSON.stringify(nextResources) !== JSON.stringify(resources)) {
      await this.prisma.plan.update({ where: { id: plan.id }, data: { resources: nextResources } });
    }

    return { paypalPlanId };
  }

  // Complete subscription after approval with subscriptionId
  async completeSubscription(userId: number, planId: number, subscriptionId: string) {
    this.ensureConfigured();

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new BadRequestException('Invalid plan');

    // Fetch subscription details
    const subGetReq = new paypal.subscriptions.SubscriptionsGetRequest(subscriptionId);
    const subRes = await this.client!.execute(subGetReq);
    const sub = subRes.result as any;

    const status: string = sub.status;
    if (status !== 'ACTIVE' && status !== 'APPROVAL_PENDING' && status !== 'APPROVED') {
      this.logger.warn(`PayPal subscription ${subscriptionId} unexpected status ${status}`);
    }

    // Cancel any existing active subscription
    await this.prisma.subscription.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'canceled', endDate: new Date() },
    });

    const newSub = await this.prisma.subscription.create({
      data: { userId, planId, startDate: new Date(), status: 'active' },
      select: { id: true },
    });

    // Record transaction
    const amountValue =
      sub.billing_info?.last_payment?.amount?.value ||
      sub.plan_overridden?.billing_cycles?.[0]?.pricing_scheme?.fixed_price?.value ||
      plan.pricePerMonth;
    await this.prisma.transaction.create({
      data: {
        userId,
        subscriptionId: newSub.id,
        planId,
        amount: String(amountValue),
        currency: 'GBP',
        gateway: 'paypal',
        status: 'success',
        metadata: {
          subscriptionId,
          planId,
        },
      } as any,
    });

    await this.prisma.log.create({
      data: {
        userId,
        action: 'plan_change',
        metadata: { event: 'paypal_subscription_active', subscriptionId, planId },
      },
    });

    // Optional email
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.mail.sendPaymentSuccess(
        user.email,
        String(amountValue),
        'GBP',
        plan.name,
        undefined,
      ).catch(() => undefined);
    }

    return { ok: true };
  }
}