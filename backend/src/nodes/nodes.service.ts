import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NodeStatus } from '@prisma/client';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import * as net from 'net';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class NodesService {
  constructor(private prisma: PrismaService) {}

  async list(page = 1, pageSize = 20, pendingOnly = false) {
    const p = clamp(page, 1, 100000);
    const ps = clamp(pageSize, 1, 100);
    const where = pendingOnly ? { approved: false } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.node.count({ where }),
      this.prisma.node.findMany({ where, orderBy: { id: 'asc' }, skip: (p - 1) * ps, take: ps }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async create(dto: CreateNodeDto) {
    return this.prisma.node.create({
      data: {
        name: dto.name,
        location: dto.location,
        ip: dto.ip,
        status: (dto.status || 'online') as NodeStatus,
        capacity: dto.capacity,
      },
    });
  }

  async update(id: number, dto: UpdateNodeDto) {
    const exists = await this.prisma.node.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Node not found');
    return this.prisma.node.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.ip !== undefined ? { ip: dto.ip } : {}),
        ...(dto.status !== undefined ? { status: dto.status as NodeStatus } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      },
    });
  }

  async toggle(id: number) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('Node not found');
    const nextStatus: NodeStatus = node.status === 'online' ? 'offline' : 'online';
    return this.prisma.node.update({
      where: { id },
      data: { status: nextStatus },
    });
  }

  async delete(id: number) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('Node not found');
    // Set nodeId to null for servers assigned to this node
    await this.prisma.$transaction([
      this.prisma.server.updateMany({ where: { nodeId: id }, data: { nodeId: null } }),
      this.prisma.node.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  async ping(id: number, port = 80, timeoutMs = 1500) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('Node not found');

    const start = Date.now();
    const host = node.ip;

    const result = await new Promise<{ reachable: boolean; ms?: number; error?: string }>((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const onDone = (res: { reachable: boolean; ms?: number; error?: string }) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {}
        resolve(res);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        const ms = Date.now() - start;
        onDone({ reachable: true, ms });
      });
      socket.once('timeout', () => {
        onDone({ reachable: false, error: 'timeout' });
      });
      socket.once('error', (err) => {
        onDone({ reachable: false, error: err?.message || 'error' });
      });
      try {
        socket.connect(port, host);
      } catch (err: any) {
        onDone({ reachable: false, error: err?.message || 'error' });
      }
    });

    return {
      host,
      port,
      ...result,
      checkedAt: new Date().toISOString(),
    };
  }
}