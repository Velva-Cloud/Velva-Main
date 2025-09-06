import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NodesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.node.findMany({ orderBy: { id: 'asc' } });
  }
}