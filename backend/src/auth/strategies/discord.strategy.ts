import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-discord';

function resolveCallbackUrl(defaultPath: string): string {
  const fromEnv = process.env.DISCORD_CALLBACK_URL || process.env.OAUTH_CALLBACK_BASE;
  const panel = process.env.PANEL_URL;
  const frontend = process.env.FRONTEND_URL;
  const pick = (url?: string) => (url && /^https?:\/\/.+/i.test(url) ? url.replace(/\/$/, '') : null);
  const base = pick(fromEnv) || pick(panel) || pick(frontend) || 'http://localhost:3000';
  return `${base}${defaultPath}`;
}

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor() {
    super({
      clientID: process.env.DISCORD_CLIENT_ID || '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
      callbackURL: resolveCallbackUrl('/api/auth/discord/callback'),
      scope: ['identify', 'email'],
      passReqToCallback: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ) {
    const email = profile.email;
    return {
      provider: 'discord',
      oauthId: profile.id,
      email,
    };
  }
}