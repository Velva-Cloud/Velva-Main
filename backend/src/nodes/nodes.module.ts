import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { NodesAgentController } from './agent.controller';
import { PkiService } from '../common/pki.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [NodesService, PkiService, PrismaService],
  controllers: [NodesController, NodesAgentController],
})
export class NodesModule {}