import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { StatusService } from './status.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';

@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(private service: StatusService) {}

  @Get('system')
  async system() {
    return this.service.getSystemStatus();
  }

  // Admin: restart platform containers (backend/frontend; optionally daemon)
  @Post('platform/update')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async platformUpdate(@Request() _req: any, @Body() body: { includeDaemon?: boolean }) {
    const includeDaemon = !!(body?.includeDaemon);
    return this.service.updatePlatform(includeDaemon);
  }
}