import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findAll(): Promise<Pick<User, 'id' | 'email' | 'role' | 'createdAt' | 'lastLogin'>[]> {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true, lastLogin: true },
      orderBy: { id: 'desc' },
    });
  }

  async updateRole(userId: number, role: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }
}