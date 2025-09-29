import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentClientModule } from '../servers/agent-client.module';
import { QueueController } from './queue.controller';

@Module({
  imports: [PrismaModule, AgentClientModule],
  providers: [QueueService],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}