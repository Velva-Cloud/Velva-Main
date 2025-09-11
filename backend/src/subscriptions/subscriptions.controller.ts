import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private service: SubscriptionsService) {}

  private nextRenewalDateFrom(startDate: Date) {
    const d = new Date(startDate);
    const month = d.getMonth();
    d.setMonth(month + 1);
    // Handle cases where adding a month overflows (e.g., Jan 31 -> Mar 3)
    // If overflowed, set to last day of the target month
    if (d.getMonth() === (month + 2) % 12) {
      d.setDate(0);
    }
    return d;
  }

  @Get('me')
  async me(@Request() req: any) {
    const userId = req.user.userId as number;
    const sub = await this.service.getCurrent(userId);
    if (!sub) return null;
    const nextRenewalDate = this.nextRenewalDateFrom(sub.startDate);
    return {
      ...sub,
      nextRenewalDate,
    };
  }

  @Post()
  async subscribe(@Body() body: { planId: number; customRamGB?: number }, @Request() req: any) {
    const userId = req.user.userId as number;
    const sub = await this.service.create(userId, Number(body.planId), { customRamGB: body.customRamGB });
    const nextRenewalDate = this.nextRenewalDateFrom(sub.startDate);
    // Include plan details for convenience
    const withPlan = await this.service.getCurrent(userId);
    return {
      ...(withPlan ?? sub),
      nextRenewalDate,
    };
  }

  @Post('cancel')
  async cancel(@Request() req: any) {
    const userId = req.user.userId as number;
    return this.service.cancel(userId);
  }
}