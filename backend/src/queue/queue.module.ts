import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentClientModule } from '../servers/agent-client.module';
import { QueueController } from './queue.controller';
import { QueueSseController } from './queue.sse.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AgentClientModule, AuthModule],
  providers: [QueueService],
  controllers: [QueueController, QueueSseController],
  exports: [QueueService],
})
export class QueueModule {}