import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, JobsOptions } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AgentClientService } from '../servers/agent-client.service';
import EventEmitter from 'events';

function backoffOptions(): JobsOptions {
  const base = Number(process.env.JOBS_BACKOFF_BASE_MS || 5000);
  const attempts = Number(process.env.JOBS_MAX_ATTEMPTS || 3);
  return {
    attempts,
    backoff: { type: 'exponential', delay: base },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: IORedis;
  private ready = false;

  // Queues
  private provisionQ: Queue;
  private startQ: Queue;
  private stopQ: Queue;
  private restartQ: Queue;
  private deleteQ: Queue;

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

  private async bootstrapWorkers() {
    const workerConn = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    // Concurrency defaults, configurable via env
    const provisionConc = Number(process.env.Q_PROVISION_CONCURRENCY || 3);
    const startConc = Number(process.env.Q_START_CONCURRENCY || 10);
    const stopConc = Number(process.env.Q_STOP_CONCURRENCY || 10);
    const restartConc = Number(process.env.Q_RESTART_CONCURRENCY || 5);
    const deleteConc = Number(process.env.Q_DELETE_CONCURRENCY || 5);

    const wProvision = new Worker(
      'provision',
      async job => {
        const { serverId } = job.data as { serverId: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!s) throw new Error('server_not_found');
        const plan = await this.prisma.plan.findUnique({ where: { id: s.planId } });
        if (!plan) throw new Error('plan_not_found');
        const resources: any = plan.resources || {};
        const cpu = typeof resources.cpu === 'number' ? resources.cpu : undefined;
        const ramMB = typeof resources.ramMB === 'number' ? resources.ramMB : undefined;
        let image = typeof resources.image === 'string' ? resources.image : 'nginx:alpine';

        // Check if an image override was provided at creation
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

        const baseURL = await this.nodeBaseUrl(s.nodeId);
        await this.agents.provision(baseURL, { serverId: s.id, name: s.name, image, cpu, ramMB });

        await this.prisma.log.create({
          data: { userId: s.userId, action: 'plan_change', metadata: { event: 'provision_ok', serverId: s.id } },
        });

        // Auto-start
        await this.agents.start(baseURL, s.id);
        await this.prisma.server.update({ where: { id: s.id }, data: { status: 'running' } });
        await this.prisma.log.create({
          data: { userId: s.userId, action: 'plan_change', metadata: { event: 'server_status_change', serverId: s.id, status: 'running' } },
        });

        return { ok: true };
      },
      { connection: workerConn, concurrency: provisionConc },
    );

    const wStart = new Worker(
      'start',
      async job => {
        const { serverId, actorUserId } = job.data as { serverId: number; actorUserId?: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!s) throw new Error('server_not_found');
        const baseURL = await this.nodeBaseUrl(s.nodeId);
        await this.agents.start(baseURL, s.id);
        await this.prisma.server.update({ where: { id: s.id }, data: { status: 'running' } });
        await this.prisma.log.create({
          data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_status_change', serverId: s.id, status: 'running' } },
        });
        return { ok: true };
      },
      { connection: workerConn, concurrency: startConc },
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
        return { ok: true };
      },
      { connection: workerConn, concurrency: stopConc },
    );

    const wRestart = new Worker(
      'restart',
      async job => {
        const { serverId, actorUserId } = job.data as { serverId: number; actorUserId?: number };
        const s = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!s) throw new Error('server_not_found');
        const baseURL = await this.nodeBaseUrl(s.nodeId);
        await this.agents.restart(baseURL, s.id);
        // Keep running
        await this.prisma.server.update({ where: { id: s.id }, data: { status: 'running' } });
        await this.prisma.log.create({
          data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_status_change', serverId: s.id, status: 'running' } },
        });
        return { ok: true };
      },
      { connection: workerConn, concurrency: restartConc },
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
          } catch (e) {
            // ignore agent failure on delete
          }
          await this.prisma.server.delete({ where: { id: s.id } });
          await this.prisma.log.create({
            data: { userId: actorUserId || null, action: 'plan_change', metadata: { event: 'server_deleted', serverId },
            },
          });
        }
        return { ok: true };
      },
      { connection: workerConn, concurrency: deleteConc },
    );

    const attach = (worker: Worker, name: string) => {
      worker.on('active', job => this.emit('job_active', { queue: name, id: job.id, data: job.data }));
      worker.on('completed', job => this.emit('job_completed', { queue: name, id: job.id, returnvalue: job.returnvalue }));
      worker.on('failed', (job, err) => this.emit('job_failed', { queue: name, id: job?.id, reason: err?.message || String(err) }));
      // 'waiting' is not a typed Worker event in BullMQ; omit to satisfy TS types.
      worker.on('error', err => this.emit('worker_error', { queue: name, reason: err?.message || String(err) }));
    };

    attach(wProvision, 'provision');
    attach(wStart, 'start');
    attach(wStop, 'stop');
    attach(wRestart, 'restart');
    attach(wDelete, 'delete');
  }

  // Admin job visibility
  async listQueues() {
    return [
      { name: 'provision' },
      { name: 'start' },
      { name: 'stop' },
      { name: 'restart' },
      { name: 'delete' },
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
    await q.clean(graceMs, state, limit);
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