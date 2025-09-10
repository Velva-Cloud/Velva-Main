import { Body, Controller, Get, Param, ParseIntPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService, private prisma: PrismaService) {}

  // Current user profile
  @Get('me')
  async me(@Req() req: any) {
    const userId = req.user?.sub as number;
    if (!userId) return null;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, createdAt: true, lastLogin: true },
    });
    return u;
  }

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list() {
    return this.users.findAll();
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN, Role.OWNER)
  async setRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { role: Role },
  ) {
    const updated = await this.users.updateRole(id, body.role);
    await this.prisma.log.create({
      data: { action: 'plan_change', userId: null, metadata: { event: 'role_change', targetUserId: id, role: body.role } },
    });
    return updated;
  }
} },
    });
    return updated;
  }
}