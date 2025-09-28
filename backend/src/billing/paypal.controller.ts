import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { PaypalService } from './paypal.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('billing')
@Controller()
export class PaypalController {
  constructor(private paypal: PaypalService) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('billing/paypal/ensure-plan')
  async ensurePlan(@Body() body: { planId: number }) {
    return this.paypal.ensurePlan(Number(body.planId));
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('billing/paypal/complete')
  async complete(@Req() req: any, @Body() body: { planId: number; subscriptionId: string }) {
    const userId = req.user?.userId as number;
    return this.paypal.completeSubscription(userId, Number(body.planId), body.subscriptionId);
  }
}