import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../common/roles.enum';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';

function readJwtSecret(): string {
  const filePath = process.env.JWT_SECRET_FILE;
  if (filePath && fs.existsSync(filePath)) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch {
      // ignore
    }
  }
  return process.env.JWT_SECRET || 'change_this_in_production';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: readJwtSecret(),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    // Start with role from token (fallback)
    const tokenRoleRaw = (payload?.role ?? 'USER') as string;
    const tokenRoleUpper = String(tokenRoleRaw).toUpperCase();
    let role: Role =
      tokenRoleUpper === 'OWNER' ? Role.OWNER :
      tokenRoleUpper === 'ADMIN' ? Role.ADMIN :
      tokenRoleUpper === 'SUPPORT' ? Role.SUPPORT :
      Role.USER;

    // Override with current DB role if available so promotions take effect immediately
    try {
      const u = await this.prisma.user.findUnique({
        where: { id: Number(payload.sub) },
        select: { id: true, role: true, email: true },
      });
      if (u?.role) {
        const dbUpper = String(u.role).toUpperCase();
        role =
          dbUpper === 'OWNER' ? Role.OWNER :
          dbUpper === 'ADMIN' ? Role.ADMIN :
          dbUpper === 'SUPPORT' ? Role.SUPPORT :
          Role.USER;
      }
    } catch {
      // ignore DB errors; fall back to token role
    }

    // Attach user info to request object
    return { userId: payload.sub, email: payload.email, role };
  }
}