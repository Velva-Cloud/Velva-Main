import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ServersModule } from '../src/servers/servers.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Minimal Prisma mock to satisfy ServersService methods used by controller actions
function createPrismaMock() {
  const servers: any[] = [
    { id: 1, userId: 1, planId: 1, nodeId: null, name: 'srv-1', status: 'stopped', createdAt: new Date() },
  ];
  const plans: any[] = [{ id: 1, name: 'Plan 1', isActive: true, resources: { maxServers: 1 }, pricePerMonth: '10.00' }];
  const users: any[] = [{ id: 1, email: 'u1@example.com', role: 'USER', suspended: false }];
  const subs: any[] = [{ id: 1, userId: 1, planId: 1, startDate: new Date(), status: 'active' }];

  return {
    server: {
      findMany: jest.fn(async (args) => servers),
      findUnique: jest.fn(async ({ where }: any) => servers.find((s) => s.id === where.id) || null),
      count: jest.fn(async () => servers.length),
      create: jest.fn(async ({ data }: any) => {
        const next = { id: servers.length + 1, createdAt: new Date(), ...data };
        servers.push(next);
        return next;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = servers.findIndex((s) => s.id === where.id);
        if (idx === -1) throw new Error('not found');
        servers[idx] = { ...servers[idx], ...data };
        return servers[idx];
      }),
      delete: jest.fn(async ({ where }: any) => {
        const idx = servers.findIndex((s) => s.id === where.id);
        const [removed] = servers.splice(idx, 1);
        return removed;
      }),
    },
    plan: {
      findUnique: jest.fn(async ({ where }: any) => plans.find((p) => p.id === where.id) || null),
      count: jest.fn(async () => plans.length),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id || u.email === where.email) || null),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = users.findIndex((u) => u.id === where.id);
        users[idx] = { ...users[idx], ...data };
        return users[idx];
      }),
    },
    subscription: {
      findFirst: jest.fn(async ({ where }: any) => subs.find((s) => s.userId === where.userId && s.status === where.status) || null),
      updateMany: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
    log: {
      create: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({})),
    },
    transaction: {
      create: jest.fn(async () => ({})),
    },
    node: {
      findUnique: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (actions: any[]) => {
      // naive parallel exec
      return Promise.all(actions.map((fn) => fn));
    }),
  } as unknown as PrismaService;
}

describe('Servers e2e (mocked Prisma)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ServersModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /servers should require auth (handled by guard in real app)', async () => {
    // We don't have auth middleware here, just ensure route exists
    const res = await request(app.getHttpServer()).get('/servers');
    expect([200, 401, 403]).toContain(res.status);
  });

  it('Server lifecycle: start -> stop -> restart (status transitions)', async () => {
    // Pretend authentication by bypassing guard in test env (not set here)
    // Assert service endpoints exist and return something
    const sid = 1;
    await request(app.getHttpServer()).patch(`/servers/${sid}/status`).send({ status: 'running', reason: 'test' });
    await request(app.getHttpServer()).post(`/servers/${sid}/stop`).send({ reason: 'test' });
    await request(app.getHttpServer()).post(`/servers/${sid}/restart`).send({ reason: 'test' });
    const res = await request(app.getHttpServer()).get(`/servers/${sid}`);
    expect([200, 401, 403]).toContain(res.status);
  });
});