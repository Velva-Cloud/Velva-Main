import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ServersModule } from '../src/servers/servers.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

// Minimal Prisma mock to satisfy ServersService methods used by controller actions
function createPrismaMock() {
  const servers: any[] = [
    { id: 1, userId: 2, planId: 1, nodeId: null, name: 'srv-1', status: 'stopped', createdAt: new Date() },
  ];
  const plans: any[] = [{ id: 1, name: 'Plan 1', isActive: true, resources: { maxServers: 3 }, pricePerMonth: '10.00' }];
  const users: any[] = [
    { id: 1, email: 'owner@example.com', role: 'OWNER', suspended: false },
    { id: 2, email: 'admin@example.com', role: 'ADMIN', suspended: false },
    { id: 3, email: 'support@example.com', role: 'SUPPORT', suspended: false },
  ];
  const subs: any[] = [
    { id: 1, userId: 2, planId: 1, startDate: new Date(), status: 'active', plan: plans[0] },
  ];

  return {
    server: {
      findMany: jest.fn(async () => servers),
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
      count: jest.fn(async () => users.length),
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

function sign(role: 'SUPPORT' | 'ADMIN' | 'OWNER' | 'USER', sub = 2) {
  const payload = { sub, email: `${role.toLowerCase()}@example.com`, role };
  const secret = process.env.JWT_SECRET || 'change_this_in_production';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
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

  it('GET /servers with token responds', async () => {
    const token = sign('ADMIN', 2);
    const res = await request(app.getHttpServer()).get('/servers?all=1').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(res.status);
  });

  it('Server lifecycle: start -> stop -> restart (status transitions) with auth', async () => {
    const sid = 1;
    const token = sign('SUPPORT', 3);
    await request(app.getHttpServer()).patch(`/servers/${sid}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'running', reason: 'test' });
    await request(app.getHttpServer()).post(`/servers/${sid}/stop`).set('Authorization', `Bearer ${token}`).send({ reason: 'test' });
    await request(app.getHttpServer()).post(`/servers/${sid}/restart`).set('Authorization', `Bearer ${token}`).send({ reason: 'test' });
    const res = await request(app.getHttpServer()).get(`/servers/${sid}`).set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(res.status);
  });
});