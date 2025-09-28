import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { AgentClientService } from './agent-client.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [ServersService, AgentClientService],
  controllers: [ServersController],
  exports: [ServersService, AgentClientService],
})
export class ServersModule {}