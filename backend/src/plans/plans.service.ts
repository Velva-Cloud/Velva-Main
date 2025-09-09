import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  listActive() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  listAll() {
    return this.prisma.plan.findMany({
      orderBy: { id: 'asc' },
    });
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

  delete(id: number) {
    return this.prisma.plan.delete({ where: { id } });
  }
}