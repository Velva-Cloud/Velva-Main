import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { AgentClientModule } from './agent-client.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, QueueModule, AgentClientModule, MailModule],
  providers: [ServersService],
  controllers: [ServersController],
  exports: [ServersService],
})
export class ServersModule {}