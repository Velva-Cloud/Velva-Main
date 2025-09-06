import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';

@Module({
  providers: [ServersService],
  controllers: [ServersController],
})
export class ServersModule {}