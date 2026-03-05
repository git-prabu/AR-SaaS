// middleware.js — Next.js Edge Middleware for subdomain routing
import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!_next/|_static/|_vercel|favicon|api/).*)'],
};

export function middleware(req) {
  const url       = req.nextUrl.clone();
  const hostname  = req.headers.get('host') || '';
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'advertradical.com';

  // Strip port for local dev
  const cleanHost = hostname.replace(':3000', '').replace(':3001', '');

  // Detect subdomain
  // e.g. "spot.advertradical.com" → subdomain = "spot"
  // "advertradical.com" or "www.advertradical.com" → no subdomain
  const isLocalhost = cleanHost === 'localhost' || cleanHost === '127.0.0.1';

  let subdomain = null;

  if (!isLocalhost) {
    if (cleanHost !== baseDomain && cleanHost.endsWith(`.${baseDomain}`)) {
      subdomain = cleanHost.replace(`.${baseDomain}`, '');
    }
  } else {
    // Local dev: use query param ?sub=spotname
    subdomain = url.searchParams.get('sub') || null;
  }

  // Skip reserved subdomains
  const reserved = ['www', 'superadmin', 'api'];
  if (subdomain && reserved.includes(subdomain)) {
    return NextResponse.next();
  }

  if (subdomain) {
    // Rewrite to /restaurant/[subdomain] route
    url.pathname = `/restaurant/${subdomain}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}
