import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentClientService } from './agent-client.service';

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
  private readonly logger = new Logger(ServersService.name);

  constructor(private prisma: PrismaService, private agent: AgentClientService) {}

  private async nodeBaseUrl(nodeId?: number | null): Promise<string | undefined> {
    // In development, allow overriding per-node URLs with a global DAEMON_URL
    if (process.env.DAEMON_URL) return process.env.DAEMON_URL;
    if (!nodeId) return undefined;
    const node = await this.prisma.node.findUnique({ where: { id: nodeId }, select: { apiUrl: true } });
    return node?.apiUrl || undefined;
  }

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
    const plan = await this.prisma.plan.findUnique({ where: { id: s.planId }, select: { id: true, name: true, resources: true } });
    const node = s.nodeId ? await this.prisma.node.findUnique({ where: { id: s.nodeId }, select: { id: true, name: true } }) : null;
    const ip = mockIpWithPort(s.id);
    const consoleOut = mockConsoleOutput(s.name, s.status);

    // Find last provisioning-related log for this server
    const provLog = await this.prisma.log.findFirst({
      where: {
        action: 'plan_change' as any,
        OR: [
          { metadata: { contains: { serverId: id, event: 'provision_ok' } } as any },
          { metadata: { contains: { serverId: id, event: 'provision_failed' } } as any },
          { metadata: { contains: { serverId: id, event: 'provision_request' } } as any },
        ],
      },
      orderBy: { id: 'desc' },
    });

    const provisionStatus = provLog
      ? {
          lastEvent: (provLog.metadata as any)?.event || null,
          lastError: (provLog.metadata as any)?.error || null,
          at: provLog.timestamp,
        }
      : null;

    return {
      ...s,
      mockIp: ip,
      consoleOutput: consoleOut,
      planName: plan?.name ?? null,
      nodeName: node?.name ?? null,
      provisionStatus,
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

    // Select a node based on capacity (capacity = max server slots for now)
    const candidates = await this.prisma.node.findMany({
      where: { status: 'online' as any },
      select: { id: true, capacity: true },
      orderBy: { id: 'asc' },
    });
    if (!candidates.length) {
      throw new BadRequestException('No online nodes available');
    }
    let chosen: { id: number; capacity: number } | null = null;
    for (const node of candidates) {
      const count = await this.prisma.server.count({ where: { nodeId: node.id } });
      if (count < (node.capacity || 0)) {
        chosen = node;
        break;
      }
    }
    if (!chosen) {
      throw new BadRequestException('Insufficient node capacity');
    }

    const server = await this.prisma.server.create({
      data: {
        userId,
        planId: plan.id,
        name: n,
        status: 'stopped',
        nodeId: chosen.id,
      },
    });

    await this.prisma.log.create({
      data: { userId, action: 'server_create', metadata: { serverId: server.id, name: n, planId: plan.id, nodeId: chosen.id } },
    });

    // Attempt to provision container on the daemon (synchronously for now)
    try {
      const resources: any = plan.resources || {};
      const cpu = typeof resources.cpu === 'number' ? resources.cpu : undefined;
      const ramMB = typeof resources.ramMB === 'number' ? resources.ramMB : undefined;
      const image = (resources.image as string) || 'nginx:alpine';
      const baseURL = await this.nodeBaseUrl(chosen.id);
      await this.agent.provision(baseURL, { serverId: server.id, name: n, image, cpu, ramMB });
      await this.prisma.log.create({
        data: { userId, action: 'plan_change', metadata: { event: 'provision_ok', serverId: server.id, nodeId: chosen.id } },
      });
    } catch (e: any) {
      await this.prisma.log.create({
        data: { userId, action: 'plan_change', metadata: { event: 'provision_failed', serverId: server.id, error: e?.message || String(e) } },
      });
      // keep server record; admin/support can retry
    }

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

    // Call agent
    try {
      const s = await this.prisma.server.findUnique({ where: { id }, select: { nodeId: true } });
      const baseURL = await this.nodeBaseUrl(s?.nodeId);
      if (status === 'running') {
        await this.agent.start(baseURL, id);
      } else {
        await this.agent.stop(baseURL, id);
      }
    } catch (e) {
      // still update DB to reflect requested state, but log failure
      await this.prisma.log.create({
        data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'agent_action_failed', serverId: id, op: status, reason: reason || null } },
      });
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
    try {
      const s = await this.prisma.server.findUnique({ where: { id }, select: { nodeId: true } });
      const baseURL = await this.nodeBaseUrl(s?.nodeId);
      await this.agent.delete(baseURL, id);
    } catch {
      // ignore agent failure on delete
    }
    return this.prisma.server.delete({ where: { id } });
  }

  // Provision via agent
  async provision(id: number, actorUserId?: number) {
    await this.prisma.log.create({
      data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'provision_request', serverId: id } },
    });
    const s = await this.prisma.server.findUnique({ where: { id } });
    if (!s) throw new BadRequestException('Server not found');
    const plan = await this.prisma.plan.findUnique({ where: { id: s.planId } });
    const resources: any = plan?.resources || {};
    try {
      const baseURL = await this.nodeBaseUrl(s.nodeId);
      await this.agent.provision(baseURL, {
        serverId: s.id,
        name: s.name,
        image: (resources.image as string) || 'nginx:alpine',
        cpu: typeof resources.cpu === 'number' ? resources.cpu : undefined,
        ramMB: typeof resources.ramMB === 'number' ? resources.ramMB : undefined,
      });
      await this.prisma.log.create({
        data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'provision_ok', serverId: id } },
      });
    } catch (e: any) {
      await this.prisma.log.create({
        data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'provision_failed', serverId: id, error: e?.message || String(e) } },
      });
    }
    return this.getById(id);
  }

  async start(id: number, actorUserId?: number, reason?: string) {
    return this.setStatus(id, 'running', actorUserId, reason);
  }

  async stop(id: number, actorUserId?: number, reason?: string) {
    return this.setStatus(id, 'stopped', actorUserId, reason);
  }

  async restart(id: number, actorUserId?: number, reason?: string) {
    try {
      const s = await this.prisma.server.findUnique({ where: { id }, select: { nodeId: true } });
      const baseURL = await this.nodeBaseUrl(s?.nodeId);
      await this.agent.restart(baseURL, id);
    } catch (e) {
      await this.prisma.log.create({
        data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'agent_action_failed', serverId: id, op: 'restart', reason: reason || null } },
      });
    }
    // keep running after restart
    return this.setStatus(id, 'running', actorUserId, reason);
  }
}