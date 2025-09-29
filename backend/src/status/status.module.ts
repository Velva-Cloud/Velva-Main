import { Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusController } from './status.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { MonitorService } from './monitor.service';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [StatusController],
  providers: [StatusService, MonitorService],
})
export class StatusModule {}