import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsService } from './settings.service';
import { SettingsController, AgentsSettingsController, RegistrySettingsController } from './settings.controller';

@Module({
  imports: [PrismaModule],
  providers: [SettingsService],
  controllers: [SettingsController, AgentsSettingsController, RegistrySettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}