import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mockIpWithPort(serverId: number) {
  // Deterministic private IP/port combo based on server id
  const a = 10;
  const b = (serverId % 200) + 1;
  const c = (Math.floor(serverId / 200) % 200) + 1;
  const d = (Math.floor(serverId / 40000) % 200) + 10;
  // Common game ports like 25565 (Minecraft) or 27015 (Source)
  const port = 25000 + ((serverId * 17) % 10000);
  return `${a}.${b}.${c}.${d}:${port}`;
}

function mockConsoleOutput(serverName: string, status: string) {
  return [
    `[INFO] Bootstrapping service for ${serverName}`,
    `[INFO] Environment: production`,
    status === 'running' ? `[INFO] Server started successfully` : `[INFO] Server is currently ${status}`,
    `[INFO] Listening for connections...`,
    `[OK] Ready.`,
  ].join('\n');
}

@Injectable()
export class ServersService {
  constructor(private prisma: PrismaService) {}

  async listForUser(userId: number, page = 1, pageSize = 20) {
    const p = clamp(page, 1, 100000);
    const ps = clamp(pageSize, 1, 100);
    const where = { userId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.server.count({ where }),
      this.prisma.server.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          plan: { select: { id: true, name: true } },
          node: { select: { id: true, name: true } },
        },
        skip: (p - 1) * ps,
        take: ps,
      }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async listAll(page = 1, pageSize = 20) {
    const p = clamp(page, 1, 100000);
    const ps = clamp(pageSize, 1, 100);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.server.count(),
      this.prisma.server.findMany({ orderBy: { id: 'desc' }, skip: (p - 1) * ps, take: ps }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async getById(id: number) {
    const s = await this.prisma.server.findUnique({ where: { id } });
    if (!s) return null;
    const [plan, node] = await this.prisma.$transaction([
      this.prisma.plan.findUnique({ where: { id: s.planId }, select: { id: true, name: true } }),
      s.nodeId ? this.prisma.node.findUnique({ where: { id: s.nodeId }, select: { id: true, name: true } }) : Promise.resolve(null),
    ]);
    const ip = mockIpWithPort(s.id);
    const consoleOut = mockConsoleOutput(s.name, s.status);
    return {
      ...s,
      mockIp: ip,
      consoleOutput: consoleOut,
      planName: plan?.name ?? null,
      nodeName: node?.name ?? null,
    };
  }

  async create(userId: number, planId: number, name: string) {
    // Normalize and validate inputs (additional to DTO validation)
    const n = (name || '').trim();
    if (n.length < 3 || n.length > 32) {
      throw new BadRequestException('Name must be between 3 and 32 characters');
    }
    if (!/^[A-Za-z0-9_-]+$/.test(n)) {
      throw new BadRequestException('Name can only contain letters, numbers, dash and underscore');
    }

    // Validate plan exists and is active to avoid FK violations
    const plan = await this.prisma.plan.findUnique({ where: { id: Number(planId) } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Invalid or inactive plan');
    }

    // Validate user exists to avoid FK violation (e.g., stale session after DB reset)
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) {
      throw new BadRequestException('User not found. Please sign out and sign in again.');
    }

    // Enforce subscription plan and limits:
    // - Require an active subscription
    // - Only allow creating servers that match the subscribed plan
    // - Enforce maxServers (default 1) per plan
    const activeSub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      include: { plan: true },
      orderBy: { id: 'desc' },
    });
    if (!activeSub) {
      throw new BadRequestException('You need an active subscription to create a server.');
    }
    if (activeSub.planId !== plan.id) {
      throw new BadRequestException('Selected server size does not match your subscription.');
    }
    const maxServers = Number((activeSub.plan?.resources as any)?.maxServers ?? 1);
    const existingCount = await this.prisma.server.count({ where: { userId } });
    if (existingCount >= maxServers) {
      throw new BadRequestException(`Your plan allows up to ${maxServers} server${maxServers > 1 ? 's' : ''}. You already have ${existingCount}.`);
    }

    // Optional uniqueness by user to avoid confusion
    const existsByName = await this.prisma.server.findFirst({
      where: { userId, name: n },
      select: { id: true },
    });
    if (existsByName) {
      throw new BadRequestException('You already have a server with that name');
    }

    const server = await this.prisma.server.create({
      data: {
        userId,
        planId: plan.id,
        name: n,
        status: 'stopped',
      },
    });

    await this.prisma.log.create({
      data: { userId, action: 'server_create', metadata: { serverId: server.id, name: n, planId: plan.id } },
    });

    return server;
  }

  async update(
    id: number,
    data: Partial<{ name: string; status: 'running' | 'stopped' | 'suspended'; planId: number; nodeId: number; userId: number }>,
  ) {
    // Validate fields if provided
    if (data.name !== undefined) {
      const n = (data.name || '').trim();
      if (n.length < 3 || n.length > 32) {
        throw new BadRequestException('Name must be between 3 and 32 characters');
      }
      if (!/^[A-Za-z0-9_-]+$/.test(n)) {
        throw new BadRequestException('Name can only contain letters, numbers, dash and underscore');
      }
    }
    if (data.status !== undefined && !['running', 'stopped', 'suspended'].includes(data.status)) {
      throw new BadRequestException('Invalid status');
    }

    // Validate foreign keys if provided
    if (data.planId !== undefined) {
      const plan = await this.prisma.plan.findUnique({ where: { id: Number(data.planId) } });
      if (!plan) throw new BadRequestException('Plan not found');
    }
    if (data.nodeId !== undefined) {
      const node = await this.prisma.node.findUnique({ where: { id: Number(data.nodeId) } });
      if (!node) throw new BadRequestException('Node not found');
    }
    if (data.userId !== undefined) {
      const user = await this.prisma.user.findUnique({ where: { id: Number(data.userId) } });
      if (!user) throw new BadRequestException('User not found');
    }

    return this.prisma.server.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.planId !== undefined ? { planId: Number(data.planId) } : {}),
        ...(data.nodeId !== undefined ? { nodeId: Number(data.nodeId) } : {}),
        ...(data.userId !== undefined ? { userId: Number(data.userId) } : {}),
      },
    });
  }

  async setStatus(id: number, status: 'running' | 'stopped', actorUserId?: number, reason?: string) {
    if (!['running', 'stopped'].includes(status)) {
      throw new BadRequestException('Invalid status for this operation');
    }
    const updated = await this.prisma.server.update({
      where: { id },
      data: { status },
    });
    await this.prisma.log.create({
      data: {
        userId: actorUserId || null,
        action: 'plan_change',
        metadata: { event: 'server_status_change', serverId: id, status, reason: reason || null },
      },
    });
    return updated;
  }

  async suspend(id: number, actorUserId?: number, reason?: string) {
    const updated = await this.prisma.server.update({
      where: { id },
      data: { status: 'suspended' },
    });
    await this.prisma.log.create({
      data: {
        userId: actorUserId || null,
        action: 'plan_change',
        metadata: { event: 'server_suspended', serverId: id, reason: reason || null },
      },
    });
    return updated;
  }

  async unsuspend(id: number, actorUserId?: number, reason?: string) {
    const updated = await this.prisma.server.update({
      where: { id },
      data: { status: 'stopped' },
    });
    await this.prisma.log.create({
      data: {
        userId: actorUserId || null,
        action: 'plan_change',
        metadata: { event: 'server_unsuspended', serverId: id, reason: reason || null },
      },
    });
    return updated;
  }

  async delete(id: number) {
    return this.prisma.server.delete({ where: { id } });
  }

  // Stubs for provisioning daemon integration
  async provision(id: number, actorUserId?: number) {
    await this.prisma.log.create({
      data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'provision_request', serverId: id } },
    });
    return this.getById(id);
  }

  async start(id: number, actorUserId?: number, reason?: string) {
    return this.setStatus(id, 'running', actorUserId, reason);
  }

  async stop(id: number, actorUserId?: number, reason?: string) {
    return this.setStatus(id, 'stopped', actorUserId, reason);
  }

  async restart(id: number, actorUserId?: number, reason?: string) {
    // For mock: stop then start
    await this.setStatus(id, 'stopped', actorUserId, reason);
    return this.setStatus(id, 'running', actorUserId, reason);
  }
}