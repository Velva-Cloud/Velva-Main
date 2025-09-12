import { Module } from '@nestjs/common';
import { PaypalService } from './paypal.service';
import { PaypalController } from './paypal.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';

@Module({
  providers: [PaypalService, PrismaService, MailService, SettingsService],
  controllers: [PaypalController],
  exports: [PaypalService],
})
export class PaypalModule {}