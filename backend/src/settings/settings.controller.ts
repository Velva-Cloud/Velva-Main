import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/billing')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async get() {
    return (await this.settings.getBilling()) || { graceDays: 3 };
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  async save(@Body() body: { graceDays: number }) {
    return this.settings.saveBilling({ graceDays: Number(body.graceDays || 3) });
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/agents')
export class AgentsSettingsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async getAgents() {
    const row = await this.prisma.setting.findUnique({ where: { key: 'agents' } });
    const val = (row?.value as any) || {};
    return { requireJoinCodeOnly: !!val.requireJoinCodeOnly };
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  async saveAgents(@Body() body: { requireJoinCodeOnly?: boolean }, @Req() req: any) {
    const requireJoinCodeOnly = !!body?.requireJoinCodeOnly;
    await this.prisma.setting.upsert({
      where: { key: 'agents' },
      update: { value: { requireJoinCodeOnly } },
      create: { key: 'agents', value: { requireJoinCodeOnly } },
    });
    await this.prisma.log.create({
      data: {
        userId: req?.user?.userId ?? null,
        action: 'plan_change',
        metadata: { event: 'agent_settings_update', requireJoinCodeOnly },
      },
    });
    return { ok: true, requireJoinCodeOnly };
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/registry')
export class RegistrySettingsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async getRegistry() {
    const row = await this.prisma.setting.findUnique({ where: { key: 'registry' } });
    const val = (row?.value as any) || {};
    return {
      serveraddress: val.serveraddress || 'https://index.docker.io/v1/',
      username: val.username || '',
      // Do not return password in cleartext; indicate presence only
      hasPassword: !!val.password,
    };
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  async saveRegistry(@Body() body: { serveraddress?: string; username?: string; password?: string }, @Req() req: any) {
    const serveraddress = (body.serveraddress || 'https://index.docker.io/v1/').trim();
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();

    // Persist credentials; password stored as-is (assume encrypted at rest by DB or use vault in future)
    await this.prisma.setting.upsert({
      where: { key: 'registry' },
      update: { value: { serveraddress, username, password: password || undefined } },
      create: { key: 'registry', value: { serveraddress, username, password: password || undefined } },
    });

    await this.prisma.log.create({
      data: {
        userId: req?.user?.userId ?? null,
        action: 'plan_change',
        metadata: { event: 'registry_settings_update', serveraddress, usernameSet: !!username, passwordSet: !!password },
      },
    });

    return { ok: true };
  }
}