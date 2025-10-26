import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, User, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findAll(params?: {
    search?: string;
    role?: Role | 'ALL';
    page?: number;
    pageSize?: number;
  }): Promise<{ items: Pick<User, 'id' | 'email' | 'role' | 'createdAt' | 'lastLogin' | 'suspended' | 'firstName' | 'lastName' | 'title'>[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.UserWhereInput = {};
    if (params?.search) {
      // Most MySQL collations are case-insensitive by default; drop mode for compatibility
      where.email = { contains: params.search };
    }
    if (params?.role && params.role !== 'ALL') {
      where.role = params.role as Role;
    }
    const p = clamp(params?.page ?? 1, 1, 100000);
    const ps = clamp(params?.pageSize ?? 20, 1, 100);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        select: { id: true, email: true, role: true, createdAt: true, lastLogin: true, suspended: true, firstName: true, lastName: true, title: true },
        where,
        orderBy: { id: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  private normalizeLocalPartFromEmail(email: string): string {
    const local = (email.split('@')[0] || '').toLowerCase();
    const parts = local.split(/[._-]+/).filter(Boolean);
    let candidate = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : local.replace(/[^a-z0-9]+/g, '.');
    candidate = candidate.replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '');
    if (!candidate) candidate = `user`;
    return candidate;
  }

  private async ensureStaffEmail(userId: number, email: string) {
    // If already exists, do nothing
    const existing = await this.prisma.staffEmail.findFirst({ where: { userId } });
    if (existing) return existing;

    let base = this.normalizeLocalPartFromEmail(email);
    let local = base;
    let seq = 1;
    while (true) {
      const exists = await this.prisma.staffEmail.findUnique({ where: { local_domain: { local, domain: 'velvacloud.com' } } } as any);
      if (!exists) break;
      local = `${base}.${seq++}`;
    }
    const created = await this.prisma.staffEmail.create({
      data: { userId, local, domain: 'velvacloud.com', email: `${local}@velvacloud.com` },
    });
    return created;
  }

  async updateRole(userId: number, role: Role) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: { set: role } },
    });
    if (role === Role.SUPPORT || role === Role.ADMIN || role === Role.OWNER) {
      // Generate staff email alias
      await this.ensureStaffEmail(userId, updated.email);
    }
    return updated;
  }

  async updateEmail(userId: number, email: string) {
    // Basic normalization
    const e = email.trim().toLowerCase();
    // Uniqueness constraint will be enforced by DB; handle friendly message
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { email: e },
        select: { id: true, email: true, role: true, createdAt: true, lastLogin: true, suspended: true, firstName: true, lastName: true, title: true },
      });
      // Ensure staff alias exists for staff roles after email change
      if (updated.role === 'SUPPORT' || updated.role === 'ADMIN' || updated.role === 'OWNER') {
        await this.ensureStaffEmail(userId, updated.email);
      }
      return updated;
    } catch (err: any) {
      // P2002 unique constraint failed
      if (err?.code === 'P2002') {
        throw new BadRequestException('Email is already in use');
      }
      throw err;
    }
  }

  async updateProfile(userId: number, data: { firstName?: string | null; lastName?: string | null; title?: string | null }) {
    const payload: any = {};
    if (data.firstName !== undefined) payload.firstName = (data.firstName || '').trim() || null;
    if (data.lastName !== undefined) payload.lastName = (data.lastName || '').trim() || null;
    if (data.title !== undefined) payload.title = (data.title || '').trim() || null;
    return this.prisma.user.update({
      where: { id: userId },
      data: payload,
      select: { id: true, email: true, role: true, firstName: true, lastName: true, title: true },
    });
  }

  async deleteUser(userId: number) {
    // Remove dependent data to satisfy FK constraints
    await this.prisma.$transaction([
      this.prisma.server.deleteMany({ where: { userId } }),
      this.prisma.subscription.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.log.deleteMany({ where: { userId } }),
      this.prisma.emailMessage.deleteMany({ where: { userId } }),
      this.prisma.staffEmail.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    return { ok: true };
  }

  async create(data: Prisma.UserCreateInput) {
    const user = await this.prisma.user.create({ data });
    // Optionally create staff email if created with staff role
    if ((user.role as any) === 'SUPPORT' || (user.role as any) === 'ADMIN' || (user.role as any) === 'OWNER') {
      await this.ensureStaffEmail(user.id, user.email);
    }
    return user;
  }

  async suspend(userId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { suspended: true },
      select: { id: true, email: true, role: true, createdAt: true, lastLogin: true, suspended: true },
    });
  }

  async unsuspend(userId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { suspended: false },
      select: { id: true, email: true, role: true, createdAt: true, lastLogin: true, suspended: true },
    });
  }
}