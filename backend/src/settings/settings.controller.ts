import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';

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