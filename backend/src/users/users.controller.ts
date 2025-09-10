import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateEmailDto } from './dto/update-email.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService, private prisma: PrismaService) {}

  // Current user profile
  @Get('me')
  async me(@Req() req: any) {
    const userId = req.user?.userId as number;
    if (!userId) return null;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, createdAt: true, lastLogin: true },
    });
    return u;
  }

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list(@Query('search') search?: string, @Query('role') role?: Role | 'ALL') {
    return this.users.findAll({ search: search || undefined, role: role || undefined });
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN, Role.OWNER)
  async setRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { role: Role },
    @Req() req: any,
  ) {
    const updated = await this.users.updateRole(id, body.role);
    const actorId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { action: 'plan_change', userId: actorId, metadata: { event: 'role_change', targetUserId: id, role: body.role } },
    });
    return updated;
  }

  @Patch(':id/email')
  @Roles(Role.ADMIN, Role.OWNER)
  async setEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmailDto,
    @Req() req: any,
  ) {
    const updated = await this.users.updateEmail(id, dto.email);
    const actorId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { action: 'plan_change', userId: actorId, metadata: { event: 'user_email_update', targetUserId: id, email: updated.email } },
    });
    return updated;
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const actorId = req?.user?.userId ?? null;
    const res = await this.users.deleteUser(id);
    await this.prisma.log.create({
      data: { action: 'plan_change', userId: actorId, metadata: { event: 'user_delete', targetUserId: id } },
    });
    return res;
  }
}