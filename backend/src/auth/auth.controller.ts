import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Throttle } from '@nestjs/throttler';

function resolveFrontendBase(req: any): string {
  const envBase = process.env.FRONTEND_URL;
  if (envBase) {
    // Support comma-separated list; pick the first valid URL
    const candidates = envBase.split(',').map(s => s.trim()).filter(Boolean);
    const firstValid = candidates.find(u => /^https?:\/\/.+/i.test(u)) || candidates[0];
    if (firstValid) return firstValid.replace(/\/$/, '');
  }
  const xfProto = (req?.headers?.['x-forwarded-proto'] as string) || req?.protocol || 'http';
  const xfHost = (req?.headers?.['x-forwarded-host'] as string) || (req?.headers?.host as string) || 'localhost:3000';
  return `${xfProto}://${xfHost}`.replace(/\/$/, '');
}

function pickBaseUrl(): string {
  const pick = (url?: string) => (url && /^https?:\/\/.+/i.test(url) ? url.replace(/\/$/, '') : null);
  return (
    pick(process.env.OAUTH_CALLBACK_BASE) ||
    pick(process.env.PANEL_URL) ||
    pick(process.env.FRONTEND_URL) ||
    'http://localhost:3000'
  );
}

function resolveCallbackUrl(defaultPath: string): string {
  const base = pickBaseUrl();
  return `${base}${defaultPath}`;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @Throttle({ 'auth-register': { limit: 3, ttl: 60 * 60 * 1000 } })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @Throttle({ 'auth-login': { limit: 5, ttl: 15 * 60 * 1000 } })
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('forgot-password')
  @Throttle({ 'auth-login': { limit: 5, ttl: 15 * 60 * 1000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @Throttle({ 'auth-login': { limit: 5, ttl: 15 * 60 * 1000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  // Diagnostics: which OAuth providers are enabled at runtime
  @Get('providers')
  async providers() {
    const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const discordEnabled = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
    return {
      base: pickBaseUrl(),
      google: {
        enabled: googleEnabled,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL || resolveCallbackUrl('/api/auth/google/callback'),
      },
      discord: {
        enabled: discordEnabled,
        callbackURL:
          process.env.DISCORD_CALLBACK_URL || resolveCallbackUrl('/api/auth/discord/callback'),
      },
    };
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
    const base = resolveFrontendBase(req).replace(/\/$/, '');
    const redirectUrl = `${base}/auth/callback?token=${encodeURIComponent(token)}`;
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
    const base = resolveFrontendBase(req).replace(/\/$/, '');
    const redirectUrl = `${base}/auth/callback?token=${encodeURIComponent(token)}`;
    return res.redirect(redirectUrl);
  }
}