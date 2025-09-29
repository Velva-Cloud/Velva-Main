import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../common/roles.enum';
import * as fs from 'fs';

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
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: readJwtSecret(),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    // Normalize role in case tokens carry lowercase values
    const rawRole = (payload?.role ?? 'USER') as string;
    const upper = String(rawRole).toUpperCase();
    const role: Role =
      upper === 'OWNER' ? Role.OWNER :
      upper === 'ADMIN' ? Role.ADMIN :
      upper === 'SUPPORT' ? Role.SUPPORT :
      Role.USER;

    // Attach user info to request object
    return { userId: payload.sub, email: payload.email, role };
  }
}