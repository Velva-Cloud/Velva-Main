export type JwtPayload = {
  sub: number;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
};

function b64urlToB64(input: string): string {
  // Convert base64url to base64 and pad
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  else if (pad !== 0) s += '===';
  return s;
}

export function decodeToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadPart = parts[1];
  const b64 = b64urlToB64(payloadPart);
  try {
    // Node or polyfilled Buffer path
    const json = typeof Buffer !== 'undefined'
      ? Buffer.from(b64, 'base64').toString('utf8')
      : (typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(b64))) : '');
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    try {
      // Fallback strictly for browsers without Buffer
      const decoded = atob(b64);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}

export function getUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  const payload = decodeToken(token);
  return (payload?.role as string) || null;
}