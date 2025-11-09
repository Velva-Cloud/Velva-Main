import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeCpu(resources: any): any {
  const base = typeof resources === 'object' && resources !== null ? { ...resources } : {};
  base.cpu = 100; // enforce 100 CPU units per plan
  return base;
}

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async listActive() {
    const items = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    // Return resources with cpu normalized to 100
    return items.map((p: any) => ({ ...p, resources: normalizeCpu(p.resources) }));
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
    return { items: items.map((p: any) => ({ ...p, resources: normalizeCpu(p.resources) })), total, page: p, pageSize: ps };
  }

  create(data: { name: string; pricePerMonth: string; resources: Prisma.InputJsonValue; isActive?: boolean }) {
    const normalized = normalizeCpu(data.resources as any);
    return this.prisma.plan.create({
      data: {
        name: data.name,
        // Prisma accepts Decimal as string
        pricePerMonth: data.pricePerMonth as any,
        resources: normalized,
        isActive: data.isActive ?? true,
      },
    });
  }

  update(id: number, data: Partial<{ name: string; pricePerMonth: string; resources: Prisma.InputJsonValue; isActive: boolean }>) {
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.pricePerMonth !== undefined) patch.pricePerMonth = data.pricePerMonth as any;
    if (data.resources !== undefined) patch.resources = normalizeCpu(data.resources as any);
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    return this.prisma.plan.update({
      where: { id },
      data: patch,
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