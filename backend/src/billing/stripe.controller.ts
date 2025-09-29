import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('billing')
@Controller()
export class StripeController {
  constructor(private stripe: StripeService) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('billing/stripe/checkout')
  async checkout(@Req() req: any, @Body() body: { planId: number; successUrl?: string; cancelUrl?: string; customRamGB?: number; currency?: string }) {
    const userId = req.user?.userId as number;
    return this.stripe.createCheckoutSession(userId, Number(body.planId), body.successUrl, body.cancelUrl, body.customRamGB, body.currency);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('billing/stripe/portal')
  async portal(@Req() req: any) {
    const email = req.user?.email as string | undefined;
    if (!email) {
      const u = await this.stripe['prisma'].user.findUnique({ where: { id: req.user?.userId } });
      return this.stripe.createPortalSession(u?.email || '');
    }
    return this.stripe.createPortalSession(email);
  }

  // Stripe webhook (no auth)
  @Post('webhooks/stripe')
  async webhooks(@Headers('stripe-signature') signature: string, @Req() req: any) {
    const payload = (req as any).rawBody ?? req.body;
    const event = this.stripe.verifyAndConstructEvent(signature, payload);
    return this.stripe.handleEvent(event);
  }
}