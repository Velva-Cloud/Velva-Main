import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '../common/roles.enum';
import * as crypto from 'crypto';
import * as fs from 'fs';

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

    // Log registration as a login event with metadata
    await this.prisma.log.create({
      data: { userId: user.id, action: 'login', metadata: { event: 'register', email } },
    });

    const token = await this.signToken(user.id, user.email, user.role as Role);
    return { access_token: token };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');
    if (user.suspended) throw new UnauthorizedException('Account is suspended');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Log successful login
    await this.prisma.log.create({
      data: { userId: user.id, action: 'login', metadata: { event: 'login', email } },
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

    if (user.suspended) {
      throw new UnauthorizedException('Account is suspended');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Log OAuth login
    await this.prisma.log.create({
      data: { userId: user.id, action: 'login', metadata: { event: 'oauth', provider, email: user.email } },
    });

    return this.signToken(user.id, user.email, user.role as Role);
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Do not reveal if user exists
    if (!user) return { ok: true };

    const tokenRaw = crypto.randomBytes(32).toString('hex');
    const hours = Number(process.env.RESET_TOKEN_EXPIRES_HOURS || 2);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenRaw,
        expiresAt,
      },
    });

    // In production, send email containing link:
    // `${FRONTEND_URL}/reset?token=${tokenRaw}`
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const prt = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!prt || prt.used || prt.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: prt.userId }, data: { password: hashed } }),
      this.prisma.passwordResetToken.update({ where: { id: prt.id }, data: { used: true } }),
    ]);

    return { ok: true };
  }

  private readJwtSecret(): string {
    const filePath = process.env.JWT_SECRET_FILE;
    if (filePath && fs.existsSync(filePath)) {
      try {
        return fs.readFileSync(filePath, 'utf8').trim();
      } catch {
        // fallback
      }
    }
    return process.env.JWT_SECRET || 'change_this_in_production';
  }

  private async signToken(userId: number, email: string, role: Role) {
    const payload = { sub: userId, email, role };
    return this.jwt.signAsync(payload, {
      secret: this.readJwtSecret(),
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  }
}