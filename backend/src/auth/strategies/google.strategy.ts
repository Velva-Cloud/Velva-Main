import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

function resolveCallbackUrl(defaultPath: string): string {
  const fromEnv = process.env.GOOGLE_CALLBACK_URL || process.env.OAUTH_CALLBACK_BASE;
  const panel = process.env.PANEL_URL;
  const frontend = process.env.FRONTEND_URL;
  const pick = (url?: string) => (url && /^https?:\/\/.+/i.test(url) ? url.replace(/\/$/, '') : null);
  const base = pick(fromEnv) || pick(panel) || pick(frontend) || 'http://localhost:3000';
  return `${base}${defaultPath}`;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const explicit = process.env.GOOGLE_CALLBACK_URL && /^https?:\/\/.+/i.test(process.env.GOOGLE_CALLBACK_URL)
      ? process.env.GOOGLE_CALLBACK_URL.replace(/\/$/, '')
      : null;
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: explicit || resolveCallbackUrl('/api/auth/google/callback'),
      scope: ['profile', 'email'],
      passReqToCallback: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    const email = profile.emails?.[0]?.value;
    return {
      provider: 'google',
      oauthId: profile.id,
      email,
    };
  }
}