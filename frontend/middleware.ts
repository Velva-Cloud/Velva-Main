import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  // Force non-www for panel and root domains
  if (host === 'www.panel.velvacloud.com') {
    const url = new URL(req.url);
    url.host = 'panel.velvacloud.com';
    return NextResponse.redirect(url, 308);
  }
  if (host === 'www.velvacloud.com') {
    const url = new URL(req.url);
    url.host = 'velvacloud.com';
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}