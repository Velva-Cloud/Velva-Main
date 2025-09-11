import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role } from './roles.enum';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: number; role?: Role } | undefined;

    // If no JWT user, deny
    if (!user?.role || !user?.userId) return false;

    // Block suspended users globally (except auth routes which don't use this guard)
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { suspended: true, role: true },
    });
    if (dbUser?.suspended) {
      return false;
    }

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (requiredRoles.includes(Role.OWNER)) {
      return user.role === Role.OWNER;
    }
    // OWNER always has access to ADMIN/SUPPORT/USER endpoints
    if (user.role === Role.OWNER) return true;

    return requiredRoles.includes(user.role as Role);
  }
}