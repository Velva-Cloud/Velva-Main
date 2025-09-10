import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private prisma: PrismaService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register(dto.email, dto.password);
    await this.prisma.log.create({
      data: { action: 'login', userId: null, metadata: { event: 'register', email: dto.email } },
    });
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.auth.login(dto.email, dto.password);
    await this.prisma.log.create({
      data: { action: 'login', userId: null, metadata: { event: 'login', email: dto.email } },
    });
    return result;
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  // Google OAuth
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates Google OAuth2 login flow
    return;
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: any) {
    const { provider, oauthId, email } = req.user as { provider: 'google'; oauthId: string; email?: string };
    const token = await this.auth.handleOAuthLogin(provider, oauthId, email);
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${encodeURIComponent(token)}`;
    return res.redirect(redirectUrl);
  }

  // Discord OAuth
  @Get('discord')
  @UseGuards(AuthGuard('discord'))
  async discordAuth() {
    return;
  }

  @Get('discord/callback')
  @UseGuards(AuthGuard('discord'))
  async discordCallback(@Req() req: any, @Res() res: any) {
    const { provider, oauthId, email } = req.user as { provider: 'discord'; oauthId: string; email?: string };
    const token = await this.auth.handleOAuthLogin(provider, oauthId, email);
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${encodeURIComponent(token)}`;
    return res.redirect(redirectUrl);
  }
}