import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentClientModule } from '../servers/agent-client.module';

@Module({
  imports: [PrismaModule, AgentClientModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}