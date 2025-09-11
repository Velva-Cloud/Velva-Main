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
  }): Promise<{ items: Pick<User, 'id' | 'email' | 'role' | 'createdAt' | 'lastLogin'>[]; total: number; page: number; pageSize: number }> {
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
        select: { id: true, email: true, role: true, createdAt: true, lastLogin: true },
        where,
        orderBy: { id: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async updateRole(userId: number, role: Role) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: { set: role } },
    });
  }

  async updateEmail(userId: number, email: string) {
    // Basic normalization
    const e = email.trim().toLowerCase();
    // Uniqueness constraint will be enforced by DB; handle friendly message
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { email: e },
        select: { id: true, email: true, role: true, createdAt: true, lastLogin: true },
      });
    } catch (err: any) {
      // P2002 unique constraint failed
      if (err?.code === 'P2002') {
        throw new BadRequestException('Email is already in use');
      }
      throw err;
    }
  }

  async deleteUser(userId: number) {
    // Remove dependent data to satisfy FK constraints
    await this.prisma.$transaction([
      this.prisma.server.deleteMany({ where: { userId } }),
      this.prisma.subscription.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.log.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    return { ok: true };
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }
}