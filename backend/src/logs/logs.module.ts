import { Module } from '@nestjs/common';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { RetentionService } from './retention.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LogsService, RetentionService],
  controllers: [LogsController],
  exports: [LogsService],
})
export class LogsModule {}