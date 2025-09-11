import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BillingSettings = {
  graceDays: number;
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get<T = any>(key: string): Promise<T | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return (row?.value as any) || null;
  }

  async set<T = any>(key: string, value: T) {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as any },
      update: { value: value as any },
    });
    return { ok: true };
  }

  async getBilling(): Promise<BillingSettings | null> {
    return this.get<BillingSettings>('billing');
  }

  async saveBilling(settings: BillingSettings) {
    if (!settings.graceDays || settings.graceDays < 1) {
      settings.graceDays = 3;
    }
    return this.set('billing', {
      graceDays: Math.min(60, Math.max(1, Math.floor(settings.graceDays))),
    });
  }
}