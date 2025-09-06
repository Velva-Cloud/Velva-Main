import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private service: SubscriptionsService) {}

  @Post()
  async subscribe(@Body() body: { planId: number }, @Request() req: any) {
    const userId = req.user.userId as number;
    return this.service.create(userId, Number(body.planId));
  }
}