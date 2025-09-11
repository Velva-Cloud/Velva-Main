import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { DunningService } from './dunning.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, MailModule],
  providers: [DunningService],
})
export class DunningModule {}