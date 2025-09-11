import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  listActive() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  async listAllPaged(page = 1, pageSize = 20) {
    const p = clamp(page, 1, 100000);
    const ps = clamp(pageSize, 1, 100);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.plan.count(),
      this.prisma.plan.findMany({
        orderBy: { id: 'asc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  create(data: { name: string; pricePerMonth: string; resources: Prisma.InputJsonValue; isActive?: boolean }) {
    return this.prisma.plan.create({
      data: {
        name: data.name,
        // Prisma accepts Decimal as string
        pricePerMonth: data.pricePerMonth as any,
        resources: data.resources,
        isActive: data.isActive ?? true,
      },
    });
  }

  update(id: number, data: Partial<{ name: string; pricePerMonth: string; resources: Prisma.InputJsonValue; isActive: boolean }>) {
    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.pricePerMonth !== undefined ? { pricePerMonth: data.pricePerMonth as any } : {}),
        ...(data.resources !== undefined ? { resources: data.resources } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async delete(id: number) {
    try {
      return await this.prisma.plan.delete({ where: { id } });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        // Foreign key constraint failed on the field: `planId`
        throw new BadRequestException('Cannot delete plan: it is referenced by servers or subscriptions.');
      }
      throw e;
    }
  }
}