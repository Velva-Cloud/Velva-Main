import { Injectable } from '@nestjs/common';
import { Prisma, User, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findAll(params?: { search?: string; role?: Role | 'ALL' }): Promise<Pick<User, 'id' | 'email' | 'role' | 'createdAt' | 'lastLogin'>[]> {
    const where: Prisma.UserWhereInput = {};
    if (params?.search) {
      where.email = { contains: params.search, mode: 'insensitive' };
    }
    if (params?.role && params.role !== 'ALL') {
      where.role = params.role as Role;
    }
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true, lastLogin: true },
      where,
      orderBy: { id: 'desc' },
    });
  }

  async updateRole(userId: number, role: Role) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: { set: role } },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }
}