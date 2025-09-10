export type JwtPayload = {
  sub: number;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
};

export function decodeToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload;
  } catch {
    try {
      // Browser-safe decode
      const payload = JSON.parse(atob(parts[1]));
      return payload;
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