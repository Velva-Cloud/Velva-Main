import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { MailInboundController } from './inbound.controller';

@Module({
  imports: [PrismaModule],
  providers: [MailService],
  controllers: [MailController, MailInboundController],
  exports: [MailService],
})
export class MailModule {}