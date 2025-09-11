import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, MailModule, SettingsModule],
  providers: [StripeService],
  controllers: [StripeController],
})
export class StripeModule {}