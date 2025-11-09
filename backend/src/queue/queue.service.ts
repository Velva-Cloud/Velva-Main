import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, JobsOptions, WorkerOptions } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AgentClientService } from '../servers/agent-client.service';
import { EventEmitter } from 'events';
import * as client from 'prom-client';
import { Interval } from '@nestjs/schedule';
import { getHostPortPolicy, getInternalPorts } from '../servers/port-policy';

function backoffOptions(): JobsOptions {
  const base = Number(process.env.JOBS_BACKOFF_BASE_MS || 5000);
  const attempts = Number(process.env.JOBS_MAX_ATTEMPTS || 3);
  return {
    attempts,
    // Use custom backoff so we can skip retries for hard-fail errors
    backoff: { type: 'vcExpo', delay: base } as any,
    removeOnComplete: true,
    removeOnFail: false,
  };
}

function isHardProvisionError(err: any): boolean {
  const msg = (err?.message || err?.response?.data?.error || err?.response?.data || '').toString().toLowerCase();
  return (
    msg.includes('no space left on device') || // disk full
    msg.includes('enospc') ||
    msg.includes('insufficient memory') ||
    msg.includes('out of memory') ||
    msg.includes('oom') ||
    msg.includes('manifest unknown') ||
    msg.includes('not found: manifest unknown') ||
    msg.includes('image not found') ||
    msg.includes('manifest invalid')
  );
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: IORedis;
  private ready = false;

  // Prometheus metrics
  private jobCompleted = new client.Counter({ name: 'vc_jobs_completed_total', help: 'Total jobs completed', labelNames: ['queue'] });
  private jobFailed = new client.Counter({ name: 'vc_jobs_failed_total', help: 'Total jobs failed', labelNames: ['queue'] });

  isReady() {
    return this.ready === true;
  }

  // Queues
  private provisionQ: Queue;
  private startQ: Queue;
  private stopQ: Queue;
  private restartQ: Queue;
  private deleteQ: Queue;
  private maintenanceQ: Queue;

  // Events
  private emitter = new EventEmitter();

  constructor(
    private prisma: PrismaService,
    private agents: AgentClientService,
  ) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisOpts: RedisOptions = {
      // Required by BullMQ to avoid unexpected retries at the redis client level
      maxRetriesPerRequest: null,
    };
    this.connection = new IORedis(url, redisOpts);
    this.provisionQ = new Queue('provision', { connection: this.connection });
    this.startQ = new Queue('start', { connection: this.connection });
    this.stopQ = new Queue('stop', { connection: this.connection });
    this.restartQ = new Queue('restart', { connection: this.connection });
    this.deleteQ = new Queue('delete', { connection: this.connection });
    this.maintenanceQ = new Queue('maintenance', { connection: this.connection });
    // QueueSchedulers were required in older BullMQ versions for delayed jobs/retries.
    // In modern BullMQ, Workers manage this internally; no explicit scheduler is needed.
  }

  async onModuleInit() {
    await this.bootstrapWorkers();
    this.ready = true;
  }

  private async nodeBaseUrl(nodeId?: number | null): Promise<string | undefined> {
    if (process.env.DAEMON_URL) return process.env.DAEMON_URL;
    if (!nodeId) return undefined;
    const node = await this.prisma.node.findUnique({ where: { id: nodeId }, select: { apiUrl: true } });
    return node?.apiUrl || undefined;
  }

  private emit(event: string, payload: any) {
    try {
      this.emitter.emit('event', { type: event, ...payload, ts: Date.now() });
    } catch {}
  }

  private async recordEvent(serverId: number | null, type: string, message?: string, data?: any, userId?: number | null) {
    try {
      if (!serverId) return;
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
      // ignore
    }
  }

  private async bootstrapWorkers() {
    const workerConn = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    const base = Number(process.env.JOBS_BACKOFF_BASE_MS || 5000);
    const workerSettings: WorkerOptions = {
      connection: workerConn,
      // Custom backoff that skips retries for known hard-fail errors
      settings: {
        backoffStrategies: {
          vcExpo: (attemptsMade: number, err: Error) => {
            if (err && isHardProvisionError(err)) {
              // Skip retries for non-recoverable errors
              return -1 as any;
            }
            const delay = Math.max(base, base * Math.pow(2, Math.max(0, attemptsMade - 1)));
            return delay;
          },
        } as any,
      } as any,
    };

    // Concurrency defaults, configurable via env
    const provisionConc = Number(process.env.Q_PROVISION_CONCURRENCY || 3);
    const startConc = Number(process.env.Q_START_CONCURRENCY || 10);
    const stopConc = Number(process.env.Q_STOP_CONCURRENCY || 10);
    const restartConc = Number(process.env.Q_RESTART_CONCURRENCY || 5);
    const deleteConc = Number(process.env.Q_DELETE_CONCURRENCY || 5);
    const maintenanceConc = Number(process.env.Q_MAINTENANCE_CONCURRENCY || 2);

    const wProvision = new Worker(
      'provision',
      async job => {
        const { serverId } = job.data as { serverId: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!s) throw new Error('server_not_found');
        const plan = await this.prisma.plan.findUnique({ where: { id: s.planId } });
        if (!plan) throw new Error('plan_not_found');
        const resources: any = plan.resources || {};
        // Standardize CPU units to 100 per server regardless of plan settings
        const cpu = 100;
        const ramMB = typeof resources.ramMB === 'number' ? resources.ramMB : undefined;
        let image = typeof resources.image === 'string' ? resources.image : 'nginx:alpine';
        let env = (resources.env && typeof resources.env === 'object') ? { ...(resources.env as any) } : {};
        let mountPath = typeof resources.mountPath === 'string' ? resources.mountPath : (typeof resources.dataDir === 'string' ? resources.dataDir : undefined);
        let exposePorts = Array.isArray(resources.exposePorts) ? resources.exposePorts : undefined;
        const cmd = Array.isArray(resources.cmd) ? resources.cmd : undefined;

        // Check if an image/env override was provided at creation
        const recentCreates = await this.prisma.log.findMany({
          where: { action: 'server_create' as any },
          orderBy: { id: 'desc' },
          take: 50,
        });
        const createLog = recentCreates.find((l: any) => (l.metadata as any)?.serverId === s.id);
        const overrideImage = createLog ? (createLog.metadata as any)?.image : undefined;
        const overrideEnv = createLog ? (createLog.metadata as any)?.env : undefined;
        const provisionerMeta = createLog ? (createLog.metadata as any)?.provisioner : undefined;
        const steam = createLog ? (createLog.metadata as any)?.steam : undefined;
        if (overrideImage && typeof overrideImage === 'string' && overrideImage.trim().length > 0) {
          image = overrideImage.trim();
        }
        if (overrideEnv && typeof overrideEnv === 'object') {
          env = { ...(env || {}), ...(overrideEnv || {}) };
        }

        // Infer SteamCMD usage:
        // - If steam.appId present -> SteamCMD
        // - Or if image matches known Steam-only tags (e.g., cm2network/gmod/garrysmod)
        const looksGmod = typeof image === 'string' && /^cm2network\/(gmod|garrysmod)(:.+)?$/i.test(image);
        let usingSteam = !!(steam && typeof steam.appId === 'number' && steam.appId > 0) || looksGmod || provisionerMeta === 'steamcmd';
        if (usingSteam) {
          // For SteamCMD, do not rely on docker image; omit image field entirely
          image = undefined as any;
          // Clear docker-specific env/mountPath for steam provisioners to avoid leaking MC defaults
          env = {};
          mountPath = undefined;
        }

        // Image-specific defaults
        if (!usingSteam && image && image.includes('itzg/minecraft-server')) {
          if (!mountPath || !mountPath.trim()) {
            mountPath = '/data';
          }
          // Ensure EULA is accepted via env as well; image accepts EULA=TRUE
          if (!('EULA' in env)) {
            (env as any).EULA = 'TRUE';
          }
          // Disable auto-pause so the server doesn't stop after 60s of no players
          if (!('ENABLE_AUTOPAUSE' in env)) {
            (env as any).ENABLE_AUTOPAUSE = 'FALSE';
          }
          // Enable RCON so we can send commands via rcon-cli inside the container
          if (!('ENABLE_RCON' in env)) {
            (env as any).ENABLE_RCON = 'TRUE';
          }
          if (!('RCON_PASSWORD' in env)) {
            // Derive a reasonably unique password; this stays inside the container and is only used by rcon-cli via docker exec
            const base = process.env.RCON_SECRET || process.env.REGISTRATION_SECRET || process.env.AGENT_API_KEY || 'velva';
            const suffix = Math.abs((s.id * 2654435761) % 1e9).toString(36);
            (env as any).RCON_PASSWORD = `${base.slice(0,8)}-${suffix}`;
          }
          // Also enable console input pipe so we can send commands as true "console" (not RCON)
          if (!('CREATE_CONSOLE_IN_PIPE' in env)) {
            (env as any).CREATE_CONSOLE_IN_PIPE = 'true';
          }
          // Optionally set memory from plan ram if provided; itzg supports MEMORY (e.g., "1024M")
          if (typeof ramMB === 'number' && isFinite(ramMB) && ramMB > 0 && !('MEMORY' in env)) {
            (env as any).MEMORY = `${Math.max(512, Math.round(ramMB))}M`;
          }
        }

        // Determine internal ports if not set by plan/resources
        if (!exposePorts || !Array.isArray(exposePorts) || exposePorts.length === 0) {
          const internal = usingSteam ? (() => {
            // Minimal SRCDS defaults by appId if provided
            const appId = Number(steam?.appId || 0);
            if (appId === 740) return [{ port: 27015, protocol: 'udp' }]; // CSGO
            if (appId === 4020) return [{ port: 27015, protocol: 'udp' }]; // GMod
            if (appId === 232250) return [{ port: 27015, protocol: 'udp' }]; // TF2
            if (appId === 222860) return [{ port: 27015, protocol: 'udp' }]; // L4D2
            if (appId === 629760) return [{ port: 7777, protocol: 'udp' }]; // Mordhau
            return [{ port: 27015, protocol: 'udp' }];
          })() : getInternalPorts(image || '');
          // Send ports with protocol so daemon can validate TCP/UDP when opening firewall/NAT
          exposePorts = internal.map(p => `${p.port}/${p.protocol}`);
        }

        // Host port policy hint to daemon
        const hostPortPolicy = usingSteam ? { hostRange: [36000, 39999], protocol: 'udp', contiguous: 1 } : getHostPortPolicy(image || '');

        const baseURL = await this.nodeBaseUrl(s.nodeId);
        try {
          const forceRecreate = !!(image && image.includes('itzg/minecraft-server'));

          // Load registry credentials from settings
          let registryAuth: { username?: string; password?: string; serveraddress?: string } | undefined = undefined;
          try {
            const row = await this.prisma.setting.findUnique({ where: { key: 'registry' } });
            const val = (row?.value as any) || {};
            if (val && (val.username || val.password)) {
              registryAuth = {
                username: val.username || undefined,
                password: val.password || undefined,
                serveraddress: (val.serveraddress || 'https://index.docker.io/v1/'),
              };
            }
          } catch {
            registryAuth = undefined;
          }

          const ret = await this.agents.provision(baseURL, {
            serverId: s.id,
            name: s.name,
            image,
            cpu,
            ramMB,
            env,
            mountPath,
            exposePorts,
            cmd,
            // Force recreate when switching provisioners or images to avoid reusing old containers/volumes
            forceRecreate: true,
            hostPortPolicy,
            registryAuth,
            ...(usingSteam ? { provisioner: 'steamcmd' as const, steam } : { provisioner: 'docker' as const }),
          } as any);
          // Record assigned port if provided
          const assignedPort = (ret && (ret.port as any)) ? Number(ret.port) : null;
          if (assignedPort && Number.isFinite(assignedPort)) {
            await this.prisma.log.create({
              data: { userId: s.userId, action: 'plan_change', metadata: { event: 'port_assigned', serverId: s.id, port: assignedPort } },
            });
            await this.recordEvent(s.id, 'port_assigned', String(assignedPort));
          }
        } catch (e: any) {
          if (isHardProvisionError(e)) {
            await this.prisma.log.create({
              data: { userId: s.userId, action: 'plan_change', metadata: { event: 'provision_failed_hard', serverId: s.id, error: e?.message || String(e) } },
            });
            await this.recordEvent(s.id, 'provision_failed_hard', e?.message || String(e));
          }
          throw e;
        }

        await this.prisma.log.create({
          data: { userId: s.userId, action: 'plan_change', metadata: { event: 'provision_ok', serverId: s.id } },
        });
        await this.recordEvent(s.id, 'provision_ok');

        // Auto-start
        await this.agents.start(baseURL, s.id);

        // Verify running state via inventory; some images (e.g., Minecraft before EULA) exit immediately
        let running = true;
        try {
          const inv = await this.agents.inventory(baseURL);
          const present = inv?.containers?.find(c => c.serverId === s.id);
          running = !!(present && present.running);
        } catch {
          // best-effort; assume running if inventory fails
          running = true;
        }

        if (running) {
          await this.prisma.server.update({ where: { id: s.id }, data: { status: 'running' } });
          await this.prisma.log.create({
            data: { userId: s.userId, action: 'plan_change', metadata: { event: 'server_status_change', serverId: s.id, status: 'running' } },
          });
          await this.recordEvent(s.id, 'server_status_change', 'running');
        } else {
          // Record stopped status and a hint for Minecraft EULA
          await this.prisma.server.update({ where: { id: s.id }, data: { status: 'stopped' } });
          const hint = image.includes('itzg/minecraft-server') ? 'Server exited; accept EULA by typing "true" in Console.' : 'Server process exited.';
          await this.prisma.log.create({
            data: { userId: s.userId, action: 'plan_change', metadata: { event: 'server_exited', serverId: s.id, hint } },
          });
          await this.recordEvent(s.id, 'server_exited', hint);
        }

        return { ok: true };
      },
      { ...workerSettings, concurrency: provisionConc },
    );

    const wStart = new Worker(
      'start',
      async job => {
        const { serverId, actorUserId } = job.data as { serverId: number; actorUserId?: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!s) throw new Error('server_not_found');
        const baseURL = await this.nodeBaseUrl(s.nodeId);
        try {
          await this.agents.start(baseURL, s.id);
        } catch (e: any) {
          const msg = (e?.message || '').toString();
          if (msg.includes('container_not_found')) {
            await this.recordEvent(s.id, 'start_missing_container', `server ${s.id} missing on node ${s.nodeId}, scheduling provision`, undefined, actorUserId ?? null);
            await this.enqueueProvision(s.id);
            // Complete the job without changing status; provision will auto-start and set status
            return { ok: false, scheduledProvision: true };
          }
          throw e;
        }

        // Verify running state via inventory; if process exited immediately, mark as stopped
        let running = true;
        try {
          const inv = await this.agents.inventory(baseURL);
          const present = inv?.containers?.find(c => c.serverId === s.id);
          running = !!(present && present.running);
        } catch {
          running = true;
        }

        if (running) {
          await this.prisma.server.update({ where: { id: s.id }, data: { status: 'running' } });
          await this.prisma.log.create({
            data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_status_change', serverId: s.id, status: 'running' } },
          });
          await this.recordEvent(s.id, 'server_status_change', 'running', undefined, actorUserId ?? null);
        } else {
          await this.prisma.server.update({ where: { id: s.id }, data: { status: 'stopped' } });
          await this.prisma.log.create({
            data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_exited', serverId: s.id } },
          });
          await this.recordEvent(s.id, 'server_exited', undefined, undefined, actorUserId ?? null);
        }
        return { ok: true };
      },
      { ...workerSettings, concurrency: startConc },
    );

    const wStop = new Worker(
      'stop',
      async job => {
        const { serverId, actorUserId } = job.data as { serverId: number; actorUserId?: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!s) throw new Error('server_not_found');
        const baseURL = await this.nodeBaseUrl(s.nodeId);
        await this.agents.stop(baseURL, s.id);
        await this.prisma.server.update({ where: { id: s.id }, data: { status: 'stopped' } });
        await this.prisma.log.create({
          data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_status_change', serverId: s.id, status: 'stopped' } },
        });
        await this.recordEvent(s.id, 'server_status_change', 'stopped', undefined, actorUserId ?? null);
        return { ok: true };
      },
      { ...workerSettings, concurrency: stopConc },
    );

    const wRestart = new Worker(
      'restart',
      async job => {
        const { serverId, actorUserId } = job.data as { serverId: number; actorUserId?: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!s) throw new Error('server_not_found');
        const baseURL = await this.nodeBaseUrl(s.nodeId);
        try {
          await this.agents.restart(baseURL, s.id);
        } catch (e: any) {
          const msg = (e?.message || '').toString();
          if (msg.includes('container_not_found')) {
            await this.recordEvent(s.id, 'restart_missing_container', `server ${s.id} missing on node ${s.nodeId}, scheduling provision`, undefined, actorUserId ?? null);
            await this.enqueueProvision(s.id);
            return { ok: false, scheduledProvision: true };
          }
          throw e;
        }
        // Keep running
        await this.prisma.server.update({ where: { id: s.id }, data: { status: 'running' } });
        await this.prisma.log.create({
          data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_status_change', serverId: s.id, status: 'running' } },
        });
        await this.recordEvent(s.id, 'server_status_change', 'running', undefined, actorUserId ?? null);
        return { ok: true };
      },
      { ...workerSettings, concurrency: restartConc },
    );

    const wDelete = new Worker(
      'delete',
      async job => {
        const { serverId, actorUserId } = job.data as { serverId: number; actorUserId?: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (s) {
          const baseURL = await this.nodeBaseUrl(s.nodeId);
          try {
            await this.agents.delete(baseURL, s.id);
          } catch {
            // ignore agent failure on delete
          }
          // Remove dependent records that enforce FK constraints before deleting the server
          try {
            await this.prisma.serverEvent.deleteMany({ where: { serverId: s.id } });
          } catch {
            // ignore cleanup errors
          }
          await this.prisma.server.delete({ where: { id: s.id } });
          await this.prisma.log.create({
            data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_deleted', serverId },
            },
          });
          // Do not write ServerEvent after delete (would violate FK); recordEvent is best-effort and will no-op on failure
          await this.recordEvent(serverId, 'server_deleted', undefined, undefined, actorUserId ?? null);
        }
        return { ok: true };
      },
      { ...workerSettings, concurrency: deleteConc },
    );

    const wMaintenance = new Worker(
      'maintenance',
      async job => {
        const { nodeId } = job.data as { nodeId: number };
        const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
        if (!node) return { ok: false, reason: 'node_not_found' };
        const baseURL = await this.nodeBaseUrl(nodeId);
        let inv: { containers: Array<{ id: string; name: string; serverId?: number; running: boolean }> } | null = null;
        try {
          inv = await this.agents.inventory(baseURL);
        } catch (e: any) {
          this.logger.warn(`Maintenance inventory failed for node ${nodeId}: ${e?.message || e}`);
          return { ok: false, reason: 'inventory_failed' };
        }
        const got = inv?.containers || [];
        const containerServerIds = new Set<number>();
        for (const c of got) {
          if (typeof c.serverId === 'number') containerServerIds.add(c.serverId);
        }
        const servers = await this.prisma.server.findMany({ where: { nodeId }, select: { id: true, status: true, userId: true } });

        // DB -> Daemon reconciliation
        for (const s of servers) {
          const present = got.find(c => c.serverId === s.id);
          if (!present) {
            // Missing container: schedule provision + start for running servers
            await this.recordEvent(s.id, 'reconcile_missing_container', `server ${s.id} missing on node ${nodeId}`);
            await this.enqueueProvision(s.id);
          } else {
            // State mismatch
            if (s.status === 'running' && !present.running) {
              await this.recordEvent(s.id, 'reconcile_start', `server ${s.id} should be running`);
              await this.enqueueStart(s.id);
            }
            if (s.status === 'stopped' && present.running) {
              await this.recordEvent(s.id, 'reconcile_stop', `server ${s.id} should be stopped`);
              await this.enqueueStop(s.id);
            }
          }
        }

        // Daemon -> DB: stray containers
        for (const c of got) {
          if (!c.serverId) continue;
          const exists = servers.find(s => s.id === c.serverId);
          if (!exists) {
            await this.recordEvent(c.serverId, 'reconcile_stray_container', `stray container for ${c.serverId}, scheduling delete`);
            await this.enqueueDelete(c.serverId);
          }
        }

        return { ok: true, checked: servers.length, containers: got.length };
      },
      { ...workerSettings, concurrency: maintenanceConc },
    );

    const attach = (worker: Worker, name: string) => {
      worker.on('active', job => this.emit('job_active', { queue: name, id: job.id, data: job.data }));
      worker.on('completed', job => {
        this.jobCompleted.inc({ queue: name });
        this.emit('job_completed', { queue: name, id: job.id, returnvalue: job.returnvalue });
      });
      worker.on('failed', (job, err) => {
        this.jobFailed.inc({ queue: name });
        this.emit('job_failed', { queue: name, id: job?.id, reason: err?.message || String(err) });
      });
      // 'waiting' is not a typed Worker event in BullMQ; omit to satisfy TS types.
      worker.on('error', err => this.emit('worker_error', { queue: name, reason: err?.message || String(err) }));
    };

    attach(wProvision, 'provision');
    attach(wStart, 'start');
    attach(wStop, 'stop');
    attach(wRestart, 'restart');
    attach(wDelete, 'delete');
    attach(wMaintenance, 'maintenance');
  }

  // Periodic reconciliation across nodes
  @Interval(60_000)
  async periodicReconcile() {
    try {
      const nodes = await this.prisma.node.findMany({ where: { approved: true, status: 'online' as any }, select: { id: true } });
      for (const n of nodes) {
        await this.maintenanceQ.add('reconcile_node', { nodeId: n.id }, { jobId: `reconcile_${n.id}`, removeOnComplete: true, removeOnFail: true });
      }
    } catch (e) {
      // ignore
    }
  }

  // Admin job visibility
  async listQueues() {
    return [
      { name: 'provision' },
      { name: 'start' },
      { name: 'stop' },
      { name: 'restart' },
      { name: 'delete' },
      { name: 'maintenance' },
    ];
  }

  async listJobs(name: string, state: string, page: number, pageSize: number) {
    const q = this.getQueueByName(name);
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const jobs = await q.getJobs([state as any], start, end);
    return {
      items: jobs.map(j => ({
        id: j.id,
        name: j.name,
        data: j.data,
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp,
        finishedOn: j.finishedOn,
        processedOn: j.processedOn,
        failedReason: j.failedReason,
        stacktrace: j.stacktrace,
        state,
      })),
      page,
      pageSize,
    };
  }

  async getJob(name: string, id: number) {
    const q = this.getQueueByName(name);
    const job = await q.getJob(id as any);
    if (!job) return null;
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      progress: job.progress,
    };
  }

  onEvents(listener: (evt: any) => void) {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  private getQueueByName(name: string) {
    switch (name) {
      case 'provision':
        return this.provisionQ;
      case 'start':
        return this.startQ;
      case 'stop':
        return this.stopQ;
      case 'restart':
        return this.restartQ;
      case 'delete':
        return this.deleteQ;
      case 'maintenance':
        return this.maintenanceQ;
      default:
        throw new Error('unknown_queue');
    }
  }

  async retryJob(name: string, id: number) {
    const q = this.getQueueByName(name);
    const job = await q.getJob(id as any);
    if (!job) return { ok: false, error: 'job_not_found' };
    await job.retry();
    return { ok: true };
  }

  async removeJob(name: string, id: number) {
    const q = this.getQueueByName(name);
    const job = await q.getJob(id as any);
    if (!job) return { ok: false, error: 'job_not_found' };
    await job.remove();
    return { ok: true };
  }

  async promoteJob(name: string, id: number) {
    const q = this.getQueueByName(name);
    const job = await q.getJob(id as any);
    if (!job) return { ok: false, error: 'job_not_found' };
    await job.promote();
    return { ok: true };
  }

  async pauseQueue(name: string) {
    const q = this.getQueueByName(name);
    await q.pause();
    return { ok: true };
  }

  async resumeQueue(name: string) {
    const q = this.getQueueByName(name);
    await q.resume();
    return { ok: true };
  }

  async drainQueue(name: string) {
    const q = this.getQueueByName(name);
    await q.drain(true);
    return { ok: true };
  }

  async cleanQueue(name: string, state: 'completed' | 'failed', graceMs = 0, limit = 1000) {
    const q = this.getQueueByName(name);
    // BullMQ clean signature differs across versions; call through 'any' to satisfy TS regardless of version.
    await (q as any).clean(graceMs, state, limit);
    return { ok: true };
  }

  async enqueueProvision(serverId: number) {
    return this.provisionQ.add('provision', { serverId }, backoffOptions());
  }

  async enqueueStart(serverId: number, actorUserId?: number) {
    return this.startQ.add('start', { serverId, actorUserId }, backoffOptions());
  }

  async enqueueStop(serverId: number, actorUserId?: number) {
    return this.stopQ.add('stop', { serverId, actorUserId }, backoffOptions());
  }

  async enqueueRestart(serverId: number, actorUserId?: number) {
    return this.restartQ.add('restart', { serverId, actorUserId }, backoffOptions());
  }

  async enqueueDelete(serverId: number, actorUserId?: number) {
    return this.deleteQ.add('delete', { serverId, actorUserId }, backoffOptions());
  }
}