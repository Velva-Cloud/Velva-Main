import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentClientService } from './agent-client.service';
import { QueueService } from '../queue/queue.service';
import { MailService } from '../mail/mail.service';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Removed mock IP/console helpers to avoid test/default artifacts

type Resources = { cpu?: number; ramMB?: number; diskMB?: number; diskGB?: number; maxServers?: number; preferLocation?: string };

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(private prisma: PrismaService, private agent: AgentClientService, private queue: QueueService, private mail: MailService) {}

  async nodeBaseUrl(nodeId?: number | null): Promise<string | undefined> {
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
    const node = s.nodeId ? await this.prisma.node.findUnique({ where: { id: s.nodeId }, select: { id: true, name: true, publicIp: true } as any }) : null;
    let ip: string | null = null;
    const consoleOut: string | null = null;

    // Determine current image (plan or override)
    let imageName: string | null = null;
    try {
      imageName = (plan?.resources && typeof (plan.resources as any).image === 'string') ? ((plan!.resources as any).image as string) : null;
      const recentCreates = await this.prisma.log.findMany({
        where: { action: 'server_create' as any },
        orderBy: { id: 'desc' },
        take: 50,
      });
      const createLog = recentCreates.find((l: any) => (l.metadata as any)?.serverId === s.id);
      const override = createLog ? (createLog.metadata as any)?.image : undefined;
      if (override && typeof override === 'string' && override.trim().length > 0) {
        imageName = override.trim();
      }
    } catch {
      // ignore image detection failures
    }

    // Find last provisioning-related log for this server
    // Note: Prisma JSON filtering differs per provider; fetch recent and filter in app
    const recent = await this.prisma.log.findMany({
      where: { action: 'plan_change' as any },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const provLog = recent.find((l: any) => {
      const m = (l?.metadata as any) || {};
      return m.serverId === id && ['provision_ok', 'provision_failed', 'provision_request'].includes(m.event);
    });
    const mcPortLog = recent.find((l: any) => {
      const m = (l?.metadata as any) || {};
      return m.serverId === id && m.event === 'minecraft_port_assigned' && typeof m.port === 'number';
    });
    if (mcPortLog && (node as any)?.publicIp) {
      try {
        const assigned = Number((mcPortLog.metadata as any).port);
        if (Number.isFinite(assigned) && assigned > 0) {
          const host = (node as any).publicIp;
          ip = `${host}:${assigned}`;
        }
      } catch {
        // ignore port override failures
      }
    } else if ((node as any)?.publicIp) {
      // Try to detect mapped host port directly from agent inventory
      try {
        const baseURL = await this.nodeBaseUrl(s.nodeId);
        if (baseURL || process.env.DAEMON_URL) {
          const inv = await this.agent.inventory(baseURL);
          const cont = inv?.containers?.find((c: any) => c.serverId === s.id);
          if (cont && Array.isArray((cont as any).ports)) {
            // Prefer mapping for private 25565/tcp
            const match = (cont as any).ports.find((p: any) => Number(p.privatePort) === 25565 && String(p.type || '').toLowerCase() === 'tcp' && Number(p.publicPort) > 0);
            const hostPort = match ? Number(match.publicPort) : null;
            if (hostPort && Number.isFinite(hostPort)) {
              ip = `${(node as any).publicIp}:${hostPort}`;
            } else {
              ip = (node as any).publicIp;
            }
          } else {
            ip = (node as any).publicIp;
          }
        } else {
          ip = (node as any).publicIp;
        }
      } catch {
        ip = (node as any).publicIp;
      }
    }

    const provisionStatus = provLog
      ? {
          lastEvent: (provLog.metadata as any)?.event || null,
          lastError: (provLog.metadata as any)?.error || null,
          at: provLog.timestamp,
        }
      : null;

    // Advisory/hint for UI
    let stateHint: string | null = null;
    try {
      // Determine image (plan default or override)
      let image: string | undefined = (plan?.resources && typeof (plan.resources as any).image === 'string') ? (plan!.resources as any).image : undefined;
      const recentCreates = await this.prisma.log.findMany({
        where: { action: 'server_create' as any },
        orderBy: { id: 'desc' },
        take: 50,
      });
      const createLog = recentCreates.find((l: any) => (l.metadata as any)?.serverId === s.id);
      const override = createLog ? (createLog.metadata as any)?.image : undefined;
      if (override && typeof override === 'string' && override.trim().length > 0) {
        image = override.trim();
      }

      const isMinecraft = !!(image && image.includes('itzg/minecraft-server'));
      if (isMinecraft) {
        // If we recently saw an exit, hint that EULA is likely required
        const exited = recent.find((l: any) => {
          const m = (l?.metadata as any) || {};
          return m.serverId === id && m.event === 'server_exited';
        });
        if (exited) {
          stateHint = 'minecraft_eula_required';
        }
      } else {
        // If container missing and attempts to start occurred, hint missing container
        const missing = recent.find((l: any) => {
          const m = (l?.metadata as any) || {};
          return m.serverId === id && (m.event === 'start_missing_container' || m.event === 'reconcile_missing_container');
        });
        if (missing) {
          stateHint = 'missing_container';
        }
      }
    } catch {
      // non-fatal
      stateHint = stateHint || null;
    }

    // derive disk limit from plan resources if available
    let planDiskMb: number | null = null;
    try {
      const res = (plan?.resources || {}) as any;
      if (typeof res.diskMB === 'number') planDiskMb = Math.round(res.diskMB);
      else if (typeof res.diskGB === 'number') planDiskMb = Math.round(res.diskGB * 1024);
    } catch {}

    return {
      ...s,
      mockIp: ip || undefined,
      consoleOutput: consoleOut || undefined,
      planName: plan?.name ?? null,
      nodeName: node?.name ?? null,
      provisionStatus,
      stateHint,
      planDiskMb,
    };
  }

  // Server-level access control

  async getAccessRole(serverId: number, userId: number): Promise<'VIEWER' | 'OPERATOR' | 'ADMIN' | null> {
    const a = await this.prisma.serverAccess.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { role: true },
    } as any);
    return (a?.role as any) || null;
  }

  async listAccess(serverId: number) {
    const items = await this.prisma.serverAccess.findMany({
      where: { serverId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { id: 'asc' },
    });
    return items.map(a => ({ userId: a.user.id, email: a.user.email, role: a.role }));
  }

  async addAccess(serverId: number, actorUserId: number, email: string, role: 'VIEWER' | 'OPERATOR' | 'ADMIN') {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const actor = await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } });
    if (!actor) throw new BadRequestException('actor_not_found');
    // Only server owner or global admin/owner may manage access
    if (s.userId !== actorUserId && !(actor.role === 'ADMIN' || actor.role === 'OWNER')) {
      throw new ForbiddenException();
    }
    const target = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!target) throw new BadRequestException('user_not_found');
    if (target.id === s.userId) throw new BadRequestException('cannot_change_owner_access');

    const existing = await this.prisma.serverAccess.findUnique({
      where: { serverId_userId: { serverId, userId: target.id } },
      select: { serverId: true },
    } as any);
    if (existing) {
      await this.prisma.serverAccess.update({
        where: { serverId_userId: { serverId, userId: target.id } },
        data: { role: role as any },
      } as any);
    } else {
      await this.prisma.serverAccess.create({
        data: { serverId, userId: target.id, role: role as any },
      });
    }
    return { ok: true };
  }

  async updateAccess(serverId: number, actorUserId: number, targetUserId: number, role: 'VIEWER' | 'OPERATOR' | 'ADMIN') {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const actor = await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } });
    if (!actor) throw new BadRequestException('actor_not_found');
    if (s.userId !== actorUserId && !(actor.role === 'ADMIN' || actor.role === 'OWNER')) {
      throw new ForbiddenException();
    }
    if (targetUserId === s.userId) throw new BadRequestException('cannot_change_owner_access');
    const exists = await this.prisma.serverAccess.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      select: { serverId: true },
    } as any);
    if (!exists) throw new BadRequestException('access_not_found');
    await this.prisma.serverAccess.update({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      data: { role: role as any },
    } as any);
    return { ok: true };
  }

  async removeAccess(serverId: number, actorUserId: number, targetUserId: number) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const actor = await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } });
    if (!actor) throw new BadRequestException('actor_not_found');
    if (s.userId !== actorUserId && !(actor.role === 'ADMIN' || actor.role === 'OWNER')) {
      throw new ForbiddenException();
    }
    if (targetUserId === s.userId) throw new BadRequestException('cannot_remove_owner_access');
    await this.prisma.serverAccess.delete({
      where: { serverId_userId: { serverId, userId: targetUserId } },
    } as any);
    return { ok: true };
  }

  private toMb(val: number | undefined, assumeGbIfLarge = false): number {
    if (!val || !Number.isFinite(val)) return 0;
    if (assumeGbIfLarge && val < 1024) return Math.round(val * 1024);
    return Math.round(val);
  }

  private pickNodeFor(resources: Resources) {
    return this.prisma.node.findMany({
      where: { status: 'online' as any, approved: true },
      select: {
        id: true,
        name: true,
        location: true,
        capacityCpuCores: true,
        capacityMemoryMb: true,
        capacityDiskMb: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async create(
    userId: number,
    planId: number,
    name: string,
    imageOverride?: string,
    envOverride?: Record<string, string>,
    provisioner?: 'docker' | 'steamcmd',
    steam?: { appId: number; branch?: string; args?: string[] },
    options?: { asAdmin?: boolean },
  ) {
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
    const res = (plan.resources || {}) as Resources;
    const cpuUnits = 100; // standardize to 100 CPU units per server
    const ramMB = this.toMb(Number(res.ramMB ?? 0));
    const diskMB = res.diskMB ? this.toMb(Number(res.diskMB)) : this.toMb(Number(res.diskGB ?? 0), true);

    // Validate user exists to avoid FK violation (e.g., stale session after DB reset)
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) {
      throw new BadRequestException('User not found. Please sign out and sign in again.');
    }

    // Enforce subscription plan and limits unless created by ADMIN/OWNER
    if (!options?.asAdmin) {
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
    }

    // Optional uniqueness by user to avoid confusion
    const existsByName = await this.prisma.server.findFirst({
      where: { userId, name: n },
      select: { id: true },
    });
    if (existsByName) {
      throw new BadRequestException('You already have a server with that name');
    }

    // Capacity-aware scheduling:
    // - Filter nodes by online/approved
    // - Enforce RAM & Disk hard limits
    // - Allow CPU overcommit up to 150%
    // - Prefer location (if plan.resources.preferLocation), then least-loaded weighted score
    const nodes = await this.pickNodeFor(res);
    if (!nodes.length) throw new BadRequestException('No online nodes available');

    // Compute current usage per node
    const serversByNode = await this.prisma.server.findMany({
      where: { nodeId: { in: nodes.map(n => n.id) } },
      select: { id: true, nodeId: true, plan: { select: { resources: true } } },
    });

    const usage = new Map<number, { cpu: number; ramMB: number; diskMB: number; count: number }>();
    for (const node of nodes) {
      usage.set(node.id, { cpu: 0, ramMB: 0, diskMB: 0, count: 0 });
    }
    for (const s of serversByNode) {
      const r = (s.plan.resources || {}) as Resources;
      const c = 100; // standardize per-server CPU usage to 100 units
      const m = this.toMb(Number(r.ramMB ?? 0));
      const d = r.diskMB ? this.toMb(Number(r.diskMB)) : this.toMb(Number(r.diskGB ?? 0), true);
      const u = usage.get(s.nodeId!)!;
      u.cpu += c;
      u.ramMB += m;
      u.diskMB += d;
      u.count += 1;
    }

    const preferLoc = (res.preferLocation || '').toLowerCase().trim();

    type Candidate = { id: number; score: number; reason?: string; nodeLoc: string };
    const candidates: Candidate[] = [];
    const rejects: Array<{ nodeId: number; reason: string; cpu: { cap: number; next: number }; mem: { cap: number; next: number }; disk: { cap: number; next: number } }> = [];

    for (const node of nodes) {
      const capCpu = Number(node.capacityCpuCores ?? 0) * 100; // assume 100 cpu units per core unless specified by plans
      const capMem = Number(node.capacityMemoryMb ?? 0);
      const capDisk = Number(node.capacityDiskMb ?? 0) || Number.MAX_SAFE_INTEGER; // disk optional

      const u = usage.get(node.id)!;
      const nextCpu = u.cpu + cpuUnits;
      const nextMem = u.ramMB + ramMB;
      const nextDisk = u.diskMB + diskMB;

      // Hard-fail if RAM or Disk would exceed 100%
      if ((capMem && nextMem > capMem) || (capDisk && nextDisk > capDisk)) {
        const r: string[] = [];
        if (capMem && nextMem > capMem) r.push('mem');
        if (capDisk && nextDisk > capDisk) r.push('disk');
        rejects.push({
          nodeId: node.id,
          reason: `exceeds_${r.join('_')}`,
          cpu: { cap: capCpu, next: nextCpu },
          mem: { cap: capMem, next: nextMem },
          disk: { cap: capDisk, next: nextDisk },
        });
        continue;
      }

      // Allow CPU up to 150%
      const cpuRatio = capCpu ? nextCpu / capCpu : 0;
      if (capCpu && cpuRatio > 1.5) {
        rejects.push({
          nodeId: node.id,
          reason: 'exceeds_cpu',
          cpu: { cap: capCpu, next: nextCpu },
          mem: { cap: capMem, next: nextMem },
          disk: { cap: capDisk, next: nextDisk },
        });
        continue;
      }

      // Weighted score: prefer location, then least-loaded
      const ramRatio = capMem ? nextMem / capMem : 0;
      const diskRatio = capDisk ? nextDisk / capDisk : 0;
      // Weigh RAM highest, then CPU, then disk
      let score = ramRatio * 0.5 + Math.min(cpuRatio, 1.5) * 0.35 + diskRatio * 0.15;

      // Location preference bonus
      if (preferLoc && node.location && node.location.toLowerCase() === preferLoc) {
        score -= 0.1;
      }

      candidates.push({ id: node.id, score, nodeLoc: node.location });
    }

    if (!candidates.length) {
      // Record diagnostic log to help operators understand capacity rejection
      try {
        await this.prisma.log.create({
          data: {
            userId,
            action: 'plan_change',
            metadata: {
              event: 'capacity_reject',
              planId: plan.id,
              required: { cpuUnits, ramMB, diskMB },
              rejects,
            },
          },
        });
      } catch {}
      throw new BadRequestException('Insufficient node capacity (RAM/Disk/CPU)');
    }

    // Pick the lowest score; fallback to first (round-robin by ordered asc ids) if tie
    candidates.sort((a, b) => a.score - b.score || a.id - b.id);
    const chosenId = candidates[0].id;

    // Soft-warn thresholds: 80% usage on chosen node
    const u = usage.get(chosenId)!;
    const nodeCap = nodes.find(n => n.id === chosenId)!;
    const capCpu = Number(nodeCap.capacityCpuCores ?? 0) * 100;
    const capMem = Number(nodeCap.capacityMemoryMb ?? 0);
    const capDisk = Number(nodeCap.capacityDiskMb ?? 0) || Number.MAX_SAFE_INTEGER;

    const cpuRatio = capCpu ? (u.cpu + cpuUnits) / capCpu : 0;
    const memRatio = capMem ? (u.ramMB + ramMB) / capMem : 0;
    const diskRatio = capDisk ? (u.diskMB + diskMB) / capDisk : 0;

    const warnThreshold = 0.8;
    if ((memRatio > warnThreshold) || (capDisk && diskRatio > warnThreshold) || (capCpu && cpuRatio > warnThreshold)) {
      await this.prisma.log.create({
        data: {
          userId: null,
          action: 'plan_change',
          metadata: {
            event: 'capacity_warn',
            nodeId: chosenId,
            cpuRatio: Number(cpuRatio.toFixed(3)),
            memRatio: Number(memRatio.toFixed(3)),
            diskRatio: Number(diskRatio.toFixed(3)),
          },
        },
      });
    }

    const server = await this.prisma.server.create({
      data: {
        userId,
        planId: plan.id,
        name: n,
        status: 'stopped',
        nodeId: chosenId,
      },
    });

    await this.prisma.log.create({
      data: {
        userId,
        action: 'server_create',
        metadata: {
          serverId: server.id,
          name: n,
          planId: plan.id,
          nodeId: chosenId,
          image: imageOverride || null,
          env: envOverride || {},
          // No user-facing toggle; record inferred provisioner for workers/diagnostics
          provisioner: provisioner || undefined,
          steam: steam || undefined,
        },
      },
    });

    // Send no-reply email to user for server creation (best-effort)
    try {
      const nodeName = nodes.find(nn => nn.id === chosenId)?.name || String(chosenId);
      const dashboardUrl = `${process.env.PANEL_URL || ''}/servers/${server.id}`;
      await this.mail.sendServerCreated(user.email, { name: n, planName: plan.name, nodeName, dashboardUrl });
    } catch (e) {
      this.logger.warn(`Mail send failed for server create: ${e}`);
    }

    // Enqueue async provision + start
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'provision_request', serverId: server.id, nodeId: chosenId } },
    });
    await this.queue.enqueueProvision(server.id);

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

    const s = await this.prisma.server.findUnique({ where: { id } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);

    // If agent is not configured, update status directly so the UI reflects changes
    if (!baseURL && !process.env.DAEMON_URL) {
      const updated = await this.prisma.server.update({ where: { id }, data: { status } });
      await this.prisma.log.create({
        data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_status_change', serverId: id, status, reason: reason || null } },
      });
      return updated;
    }

    // Enqueue lifecycle action via agent/worker
    if (status === 'running') {
      await this.queue.enqueueStart(id, actorUserId);
    } else {
      await this.queue.enqueueStop(id, actorUserId);
    }

    await this.prisma.log.create({
      data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'agent_action_enqueued', serverId: id, op: status, reason: reason || null } },
    });

    // Return current record; worker will update status upon completion
    return this.prisma.server.findUnique({ where: { id } });
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
    // Enqueue delete job; worker removes container and DB record
    await this.queue.enqueueDelete(id);
    await this.prisma.log.create({ data: { userId: null, action: 'plan_change', metadata: { event: 'delete_enqueued', serverId: id } } });
    // Return a placeholder; actual record will be removed asynchronously
    return { id, status: 'deleting' } as any;
  }

  // Provision via agent (retry via queue)
  async provision(id: number, actorUserId?: number) {
    await this.prisma.log.create({
      data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'provision_request', serverId: id } },
    });
    await this.queue.enqueueProvision(id);
    return this.getById(id);
  }

  async start(id: number, actorUserId?: number, reason?: string) {
    return this.setStatus(id, 'running', actorUserId, reason);
  }

  async stop(id: number, actorUserId?: number, reason?: string) {
    return this.setStatus(id, 'stopped', actorUserId, reason);
  }

  async restart(id: number, actorUserId?: number, reason?: string) {
    await this.queue.enqueueRestart(id, actorUserId);
    await this.prisma.log.create({
      data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'agent_action_enqueued', serverId: id, op: 'restart', reason: reason || null } },
    });
    // Keep running after restart; worker will update DB
    return this.getById(id);
  }

  // New: console and file manager operations

  async streamLogs(serverId: number, res: any) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) {
      res.status(404).end();
      return;
    }
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    // If agent is not configured, do not emit mock data; inform client of unavailability
    if (!baseURL && !process.env.DAEMON_URL) {
      try { res.status(503).json({ error: 'agent_unavailable' }); } catch {}
      return;
    }
    return this.agent.streamLogs(baseURL, serverId, res);
    }

  async exec(serverId: number, cmd: string) {
    if (!cmd) throw new BadRequestException('cmd required');
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');

    // Special handling: allow "true" to accept EULA for Minecraft servers and restart
    const normalized = (cmd || '').trim().toLowerCase();
    let isMinecraft = false;
    try {
      // Determine current image (plan or override)
      const plan = await this.prisma.plan.findUnique({ where: { id: s.planId } });
      let image: string | undefined = (plan?.resources && typeof (plan.resources as any).image === 'string') ? (plan!.resources as any).image : undefined;
      // Check for image override from server_create log
      const recentCreates = await this.prisma.log.findMany({
        where: { action: 'server_create' as any },
        orderBy: { id: 'desc' },
        take: 50,
      });
      const createLog = recentCreates.find((l: any) => (l.metadata as any)?.serverId === s.id);
      const override = createLog ? (createLog.metadata as any)?.image : undefined;
      if (override && typeof override === 'string' && override.trim().length > 0) {
        image = override.trim();
      }
      isMinecraft = !!(image && image.includes('itzg/minecraft-server'));

      // If Minecraft image and user typed "true", accept EULA and restart
      if (isMinecraft && normalized === 'true') {
        // Write eula.txt on the persistent volume root; for MC mountPath defaults to /data
        return this.acceptEula(serverId);
      }
    } catch {
      // proceed
    }

    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      return { ok: false, output: 'Agent not configured; cannot execute commands.' } as any;
    }

    // For Minecraft, prefer true console via mc-send-to-console, but gracefully fall back to RCON if the pipe isn't present yet
    if (isMinecraft) {
      const toSend = (cmd || '').trim();
      const escaped = toSend.replace(/(["`$\\])/g, '\\$1');
      try {
        // Send a special marker so the daemon can run mc-send-to-console as uid 1000 without shell indirection
        const res = await this.agent.exec(baseURL, serverId, `__MC_PIPE__ ${escaped}`);
        const out = String(res?.output || '');
        if (/Console pipe needs to be enabled/i.test(out) || /Named pipe .* is missing/i.test(out) || /needs to be run with user ID 1000/i.test(out)) {
          // Fallback to RCON without surfacing an error to the user
          const r = await this.agent.exec(baseURL, serverId, `rcon-cli ${escaped}`);
          return r;
        }
        return res;
      } catch {
        // Fallback to RCON on any mc-send-to-console failure
        return this.agent.exec(baseURL, serverId, `rcon-cli ${escaped}`);
      }
    }

    // Default: run inside container shell
    return this.agent.exec(baseURL, serverId, cmd);
  }

  async acceptEula(serverId: number) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      // Agent not configured: cannot write to daemon FS; report message
      return { ok: false, output: 'Agent not configured; cannot write EULA. Please configure the node daemon.' };
    }
    const content = Buffer.from('eula=true\n', 'utf8');
    await this.agent.fsUpload(baseURL, serverId, '/', 'eula.txt', content);
    await this.queue.enqueueRestart(serverId);
    await this.prisma.log.create({
      data: { userId: s.userId, action: 'plan_change', metadata: { event: 'minecraft_eula_accepted', serverId } },
    });
    await this.recordEvent(serverId, 'minecraft_eula_accepted');
    return { ok: true, output: 'EULA accepted. Restarting server…' };
  }

  async fsList(serverId: number, path: string) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      // Simulate empty list when agent not configured
      return { path, items: [] };
    }

    // Normalize container '/data' to daemon root for this server
    const reqPath = (path || '/').toString();
    const normalizedPath = (reqPath === '/data' || reqPath.startsWith('/data/')) ? reqPath.slice('/data'.length) || '/' : reqPath;

    const primary = await this.agent.fsList(baseURL, serverId, normalizedPath);
    const items = Array.isArray(primary?.items) ? primary.items : [];
    const atRoot = (normalizedPath === '/' || normalizedPath === '' || normalizedPath === undefined);

    // Heuristic: if root doesn't contain typical Minecraft files/dirs, try '/data' alias (maps to root anyway)
    const hasWorldDir = items.some((it: any) => it?.type === 'dir' && it?.name?.toLowerCase() === 'world');
    const hasServerProps = items.some((it: any) => it?.type === 'file' && it?.name?.toLowerCase() === 'server.properties');
    const looksSparse = items.length === 0 || (items.length <= 2 && items.every((it: any) => (it?.name || '').toLowerCase() === 'eula.txt' || (it?.name || '').startsWith('.')));

    if (atRoot && (!hasWorldDir || !hasServerProps || looksSparse)) {
      try {
        const secondary = await this.agent.fsList(baseURL, serverId, '/');
        const secItems = Array.isArray(secondary?.items) ? secondary.items : [];
        // Prefer secondary if it looks richer or contains expected files
        const secHasWorld = secItems.some((it: any) => it?.type === 'dir' && it?.name?.toLowerCase() === 'world');
        const secHasProps = secItems.some((it: any) => it?.type === 'file' && it?.name?.toLowerCase() === 'server.properties');
        if (secItems.length > items.length || secHasWorld || secHasProps) {
          return secondary;
        }
      } catch {}
    }

    return primary;
  }

  async getLastLogs(serverId: number, tail = 200) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      return { ok: false, error: 'agent_unavailable', logs: '' };
    }
    const text = await this.agent.getLastLogs(baseURL, serverId, tail);
    return { ok: true, logs: text };
  }

  async fsDownload(serverId: number, path: string, res: any) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) {
      res.status(404).end();
      return;
    }
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      return res.status(503).json({ error: 'agent_unavailable' });
    }
    const { headers, stream } = await this.agent.fsDownloadStream(baseURL, serverId, path);
    if (headers['content-type']) res.setHeader('Content-Type', headers['content-type']);
    if (headers['content-disposition']) res.setHeader('Content-Disposition', headers['content-disposition']);
    stream.pipe(res);
  }

  async fsUpload(serverId: number, dirPath: string, filename: string, content: Buffer) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      throw new BadRequestException('agent_unavailable');
    }
    return this.agent.fsUpload(baseURL, serverId, dirPath, filename, content);
  }

  async fsMkdir(serverId: number, dirPath: string) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      throw new BadRequestException('agent_unavailable');
    }
    return this.agent.fsMkdir(baseURL, serverId, dirPath);
  }

  async fsDelete(serverId: number, targetPath: string) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      throw new BadRequestException('agent_unavailable');
    }
    return this.agent.fsDelete(baseURL, serverId, targetPath);
  }

  async fsRename(serverId: number, from: string, to: string) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      throw new BadRequestException('agent_unavailable');
    }
    return this.agent.fsRename(baseURL, serverId, from, to);
  }

  async getStats(serverId: number) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const baseURL = await this.nodeBaseUrl(s.nodeId);
    if (!baseURL && !process.env.DAEMON_URL) {
      throw new BadRequestException('agent_unavailable');
    }
    return this.agent.getStats(baseURL, serverId);
  }

  private async recordEvent(serverId: number, type: string, message?: string, data?: any, userId?: number | null) {
    try {
      await this.prisma.serverEvent.create({
        data: {
          serverId,
          userId: userId ?? null,
          type,
          message: message || null,
          data: data ?? {},
        },
      });
    } catch {
      // best-effort
    }
  }

  async listEvents(serverId: number, limit = 50) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');
    const items = await this.prisma.serverEvent.findMany({
      where: { serverId },
      orderBy: { id: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
    });
    return items.map(ev => ({
      id: ev.id,
      ts: ev.createdAt,
      type: ev.type,
      message: ev.message,
      data: ev.data,
    }));
  }

  async getDiagnostics(serverId: number) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!s) throw new BadRequestException('server_not_found');

    const plan = await this.prisma.plan.findUnique({ where: { id: s.planId } });
    const baseURL = await this.nodeBaseUrl(s.nodeId);

    // Derive image used (plan vs override)
    let image: string | undefined = (plan?.resources && typeof (plan.resources as any).image === 'string') ? (plan!.resources as any).image : undefined;
    const recentCreates = await this.prisma.log.findMany({
      where: { action: 'server_create' as any },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const createLog = recentCreates.find((l: any) => (l.metadata as any)?.serverId === s.id);
    const override = createLog ? (createLog.metadata as any)?.image : undefined;
    if (override && typeof override === 'string' && override.trim().length > 0) {
      image = override.trim();
    }

    let inv: any = null;
    try {
      inv = baseURL ? await this.agent.inventory(baseURL) : null;
    } catch {
      inv = null;
    }

    // Attempt to list files to verify mount path
    let fsRoot: any = null;
    try {
      fsRoot = await this.fsList(serverId, '/');
    } catch {
      fsRoot = null;
    }

    // Fetch stats for quick local connectivity hints (players implies handshake ok)
    let stats: any = null;
    try {
      stats = baseURL ? await this.agent.getStats(baseURL, serverId) : null;
    } catch {
      stats = null;
    }

    const cont = inv?.containers?.find((c: any) => c.serverId === s.id);
    // Extract mapped host port for 25565/tcp if present
    let mappedPort: number | null = null;
    try {
      const ports = (cont?.ports || []) as Array<{ privatePort: number; publicPort: number | null; type: string }>;
      const match = ports.find(p => Number(p.privatePort) === 25565 && String(p.type || '').toLowerCase() === 'tcp' && Number(p.publicPort) > 0);
      mappedPort = match ? Number(match.publicPort) : null;
    } catch {}

    return {
      server: { id: s.id, status: s.status, nodeId: s.nodeId },
      image,
      container: cont || null,
      filesRoot: fsRoot,
      mappedPort,
      stats,
    };
  }
}