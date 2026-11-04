// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Protege /dashboard/*: exige JWT sc_session válido o redirige a /login.

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    return NextResponse.next();
  }

  const redirectUrl = new URL('/login', request.url);
  redirectUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
