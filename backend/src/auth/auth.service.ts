import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '../common/roles.enum';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new UnauthorizedException('Email already in use');
    }
    const hashed = await bcrypt.hash(password, 10);

    // First registered user becomes OWNER for bootstrap
    const userCount = await this.prisma.user.count();
    const role: Role = userCount === 0 ? Role.OWNER : Role.USER;

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashed,
        role,
      },
    });
    const token = await this.signToken(user.id, user.email, user.role as Role);
    return { access_token: token };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const token = await this.signToken(user.id, user.email, user.role as Role);
    return { access_token: token };
  }

  async handleOAuthLogin(provider: 'google' | 'discord', oauthId: string, email?: string) {
    let user = await this.prisma.user.findFirst({ where: { oauthProvider: provider, oauthId } });

    if (!user && email) {
      // Link by email if exists
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { oauthProvider: provider, oauthId },
        });
      }
    }

    if (!user) {
      // Create new user
      const userCount = await this.prisma.user.count();
      const role: Role = userCount === 0 ? Role.OWNER : Role.USER;

      user = await this.prisma.user.create({
        data: {
          email: email ?? `${provider}_${oauthId}@example.local`,
          oauthProvider: provider,
          oauthId,
          role,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    return this.signToken(user.id, user.email, user.role as Role);
  }

  private async signToken(userId: number, email: string, role: Role) {
    const payload = { sub: userId, email, role };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET || 'change_this_in_production',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  }
}