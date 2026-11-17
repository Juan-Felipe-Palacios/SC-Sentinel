// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Protege /dashboard/*: exige JWT sc_session (admin) o sc_guest (visitante).
// Genera un nonce por request y emite la CSP con nonce en páginas HTML.
// P2: fuera de desarrollo la cabecera es Report-Only y apunta a /api/csp-report.

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { GUEST_COOKIE, verifyGuestToken } from '@/lib/auth/guest';
import {
  CSP_HEADER,
  CSP_REPORTING_ENDPOINTS,
  CSP_REPORT_ONLY_HEADER,
  buildContentSecurityPolicy,
  resolveCspMode,
} from '@/lib/security/headers';

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === 'development';
  const mode = resolveCspMode();
  const reportOnly = mode === 'report-only';
  const csp = buildContentSecurityPolicy(nonce, isDev, reportOnly);
  // Next.js lee el nonce de la cabecera CSP de la request (acepta también la
  // variante Report-Only: app-render consulta ambas).
  const cspHeader = reportOnly ? CSP_REPORT_ONLY_HEADER : CSP_HEADER;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(cspHeader, csp);

  const withCsp = (response: NextResponse) => {
    response.headers.set(cspHeader, csp);
    if (reportOnly) response.headers.set('Reporting-Endpoints', CSP_REPORTING_ENDPOINTS);
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
