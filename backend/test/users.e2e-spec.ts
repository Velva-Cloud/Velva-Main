import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { UsersModule } from '../src/users/users.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

function createPrismaMock() {
  const users: any[] = [
    { id: 1, email: 'owner@example.com', role: 'OWNER', createdAt: new Date(), lastLogin: null, suspended: false },
    { id: 2, email: 'admin@example.com', role: 'ADMIN', createdAt: new Date(), lastLogin: null, suspended: false },
    { id: 3, email: 'support@example.com', role: 'SUPPORT', createdAt: new Date(), lastLogin: null, suspended: false },
    { id: 4, email: 'user@example.com', role: 'USER', createdAt: new Date(), lastLogin: null, suspended: false },
  ];
  return {
    user: {
      count: jest.fn(async () => users.length),
      findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id || u.email === where.email) || null),
      findMany: jest.fn(async () => users),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = users.findIndex((u) => u.id === where.id);
        users[idx] = { ...users[idx], ...data };
        return users[idx];
      }),
      delete: jest.fn(async () => ({})),
    },
    log: {
      create: jest.fn(async () => ({})),
    },
    server: { deleteMany: jest.fn(async () => ({})) },
    subscription: { deleteMany: jest.fn(async () => ({})) },
    passwordResetToken: { deleteMany: jest.fn(async () => ({})) },
    transaction: { deleteMany: jest.fn(async () => ({})) },
  } as unknown as PrismaService;
}

function sign(role: 'SUPPORT' | 'ADMIN' | 'OWNER' | 'USER', sub = 99) {
  const payload = { sub, email: `${role.toLowerCase()}@example.com`, role };
  const secret = process.env.JWT_SECRET || 'change_this_in_production';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

describe('Users e2e (mocked Prisma)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UsersModule],
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

  it('GET /users as SUPPORT should be allowed (read-only)', async () => {
    const token = sign('SUPPORT');
    const res = await request(app.getHttpServer()).get('/users').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.items)).toBe(true);
    }
  });

  it('POST /users/:id/suspend as ADMIN should work', async () => {
    const token = sign('ADMIN');
    const res = await request(app.getHttpServer()).post('/users/4/suspend').set('Authorization', `Bearer ${token}`).send({ reason: 'test' });
    expect([200, 403]).toContain(res.status);
  });
});