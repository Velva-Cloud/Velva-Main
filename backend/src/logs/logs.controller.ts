import { Controller, Get, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('logs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('logs')
export class LogsController {
  constructor(private service: LogsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list() {
    return this.service.listAll();
  }
}