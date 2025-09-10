import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { CreateServerDto } from './dto/create-server.dto';

@ApiTags('servers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('servers')
export class ServersController {
  constructor(private service: ServersService) {}

  @Get()
  async list(@Request() req: any, @Query('all') all?: string) {
    const user = req.user as { userId: number; role: Role };
    if (all === '1' && (user.role === Role.ADMIN || user.role === Role.OWNER)) {
      return this.service.listAll();
    }
    return this.service.listForUser(user.userId);
  }

  @Post()
  async create(@Request() req: any, @Body() body: CreateServerDto) {
    const user = req.user as { userId: number };
    return this.service.create(user.userId, body.planId, body.name);
  }
}