import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { AgentClientService } from './agent-client.service';

@Module({
  providers: [ServersService, AgentClientService],
  controllers: [ServersController],
})
export class ServersModule {}