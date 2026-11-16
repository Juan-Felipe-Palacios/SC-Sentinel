// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Protege /dashboard/*: exige JWT sc_session (admin) o sc_guest (visitante).
// Genera un nonce por request y emite la CSP con nonce en páginas HTML.

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { GUEST_COOKIE, verifyGuestToken } from '@/lib/auth/guest';
import { buildContentSecurityPolicy } from '@/lib/security/headers';

const CSP_HEADER = 'Content-Security-Policy';

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === 'development';
  const csp = buildContentSecurityPolicy(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(CSP_HEADER, csp);

  const withCsp = (response: NextResponse) => {
    response.headers.set(CSP_HEADER, csp);
    return response;
  };

  // Rutas públicas: CSP por request, sin exigir sesión.
  if (!pathname.startsWith('/dashboard')) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // /dashboard/*: misma protección que antes.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const guestToken = request.cookies.get(GUEST_COOKIE)?.value;
  if (guestToken && (await verifyGuestToken(guestToken))) {
    if (request.nextUrl.pathname.startsWith('/dashboard/settings')) {
      return withCsp(NextResponse.redirect(new URL('/dashboard/overview', request.url)));
    }
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const demoUrl = new URL('/demo', request.url);
  demoUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return withCsp(NextResponse.redirect(demoUrl));
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
