import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly successUrl = process.env.STRIPE_SUCCESS_URL || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing?success=1`;
  private readonly cancelUrl = process.env.STRIPE_CANCEL_URL || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing?canceled=1`;

  constructor(private prisma: PrismaService, private mail: MailService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn('STRIPE_SECRET_KEY not set. Stripe features will not work.');
    }
    this.stripe = new Stripe(key || 'sk_test_x', { apiVersion: '2024-06-20' });
  }

  private ensureStripeEnabled() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new BadRequestException('Stripe is not configured');
    }
  }

  async ensureStripePrice(planId: number) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new BadRequestException('Invalid or inactive plan');

    let productId = (plan.resources as any)?.stripeProductId as string | undefined;
    let priceId = (plan.resources as any)?.stripePriceId as string | undefined;

    if (productId && priceId) {
      return { plan, productId, priceId };
    }

    const product = await this.stripe.products.create({ name: plan.name, metadata: { planId: String(plan.id) } });
    productId = product.id;

    const unitAmount = Number(plan.pricePerMonth) * 100;
    const price = await this.stripe.prices.create({
      product: productId,
      unit_amount: Math.round(unitAmount),
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { planId: String(plan.id) },
    });
    priceId = price.id;

    // Persist back into resources JSON
    const resources = { ...(plan.resources as any), stripeProductId: productId, stripePriceId: priceId };
    await this.prisma.plan.update({ where: { id: plan.id }, data: { resources } });

    return { plan: { ...plan, resources }, productId, priceId };
  }

  async createCheckoutSession(userId: number, planId: number, successUrl?: string, cancelUrl?: string) {
    this.ensureStripeEnabled();
    const { plan, priceId } = await this.ensureStripePrice(planId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      success_url: successUrl || this.successUrl,
      cancel_url: cancelUrl || this.cancelUrl,
      metadata: {
        userId: String(userId),
        planId: String(planId),
      },
    });

    return { url: session.url, id: session.id };
  }

  async createPortalSession(userEmail: string) {
    this.ensureStripeEnabled();
    // Try to find a Customer by email
    const customers = await this.stripe.customers.list({ email: userEmail, limit: 1 });
    if (!customers.data.length) {
      throw new BadRequestException('No Stripe customer exists for this user yet.');
    }
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: this.successUrl,
    });
    return { url: session.url };
  }

  verifyAndConstructEvent(signature: string | undefined, payload: Buffer) {
    this.ensureStripeEnabled();
    if (!signature) throw new BadRequestException('Missing Stripe-Signature header');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET not configured');
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error('Stripe webhook signature verification failed', err?.message);
      throw new BadRequestException('Invalid signature');
    }
  }

  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Subscription created; invoice will arrive separately
        this.logger.log(`Checkout completed: ${session.id}`);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const sub = invoice.subscription;
        const totalCents = invoice.total || 0;
        const customerEmail = (invoice.customer_email || (invoice.customer as any)?.email) as string | undefined;

        const planIdMeta = invoice.lines?.data?.[0]?.price?.metadata?.planId;
        const planId = planIdMeta ? Number(planIdMeta) : undefined;

        if (!customerEmail || !planId) {
          this.logger.warn('Missing email or planId in invoice; skipping subscription activation');
          return { ok: true };
        }

        const user = await this.prisma.user.findUnique({ where: { email: customerEmail } });
        if (!user) {
          this.logger.warn(`User not found for email ${customerEmail}`);
          return { ok: true };
        }

        // Cancel existing and create new active subscription
        await this.prisma.subscription.updateMany({
          where: { userId: user.id, status: 'active' },
          data: { status: 'canceled', endDate: new Date() },
        });
        const newSub = await this.prisma.subscription.create({
          data: {
            userId: user.id,
            planId,
            startDate: new Date(),
            status: 'active',
          },
        });

        await this.prisma.transaction.create({
          data: {
            userId: user.id,
            subscriptionId: newSub.id,
            planId,
            amount: (totalCents / 100).toFixed(2) as any,
            currency: (invoice.currency || 'usd').toUpperCase(),
            gateway: 'stripe',
            status: 'success',
            metadata: {
              invoiceId: invoice.id,
              subscriptionId: sub,
              customer: invoice.customer,
              hostedInvoiceUrl: invoice.hosted_invoice_url,
            },
          },
        });

        await this.prisma.log.create({
          data: { userId: user.id, action: 'plan_change', metadata: { event: 'stripe_invoice_paid', planId, invoiceId: invoice.id } },
        });

        // Email receipt
        await this.mail.sendPaymentSuccess(
          user.email,
          (totalCents / 100).toFixed(2),
          (invoice.currency || 'usd').toUpperCase(),
          (invoice.lines?.data?.[0]?.price?.product as any)?.name,
          invoice.hosted_invoice_url || undefined,
        );

        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerEmail = (invoice.customer_email || (invoice.customer as any)?.email) as string | undefined;
        const planIdMeta = invoice.lines?.data?.[0]?.price?.metadata?.planId;
        const planId = planIdMeta ? Number(planIdMeta) : undefined;
        const user = customerEmail ? await this.prisma.user.findUnique({ where: { email: customerEmail } }) : null;

        if (user && planId) {
          await this.prisma.transaction.create({
            data: {
              userId: user.id,
              planId,
              amount: ((invoice.total || 0) / 100).toFixed(2) as any,
              currency: (invoice.currency || 'usd').toUpperCase(),
              gateway: 'stripe',
              status: 'failed',
              metadata: { invoiceId: invoice.id, reason: 'payment_failed' },
            },
          });
          await this.prisma.log.create({
            data: { userId: user.id, action: 'plan_change', metadata: { event: 'stripe_invoice_failed', planId, invoiceId: invoice.id } },
          });

          await this.mail.sendPaymentFailed(
            user.email,
            (invoice.lines?.data?.[0]?.price?.product as any)?.name,
          );
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event ${event.type}`);
    }
    return { received: true };
  }
}