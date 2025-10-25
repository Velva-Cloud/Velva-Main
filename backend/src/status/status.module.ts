import { Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusController } from './status.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { MonitorService } from './monitor.service';
import { AgentClientModule } from '../servers/agent-client.module';

@Module({
  imports: [PrismaModule, QueueModule, AgentClientModule],
  controllers: [StatusController],
  providers: [StatusService, MonitorService],
})
export class StatusModule {}