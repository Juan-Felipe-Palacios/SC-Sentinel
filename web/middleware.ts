// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Protege /dashboard/*: exige JWT sc_session (admin) o sc_guest (visitante).

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { GUEST_COOKIE, verifyGuestToken } from '@/lib/auth/guest';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isAdmin = Boolean(token && (await verifySessionToken(token)));

  if (isAdmin) {
    return NextResponse.next();
  }

  const guestToken = request.cookies.get(GUEST_COOKIE)?.value;
  const isGuest = Boolean(guestToken && (await verifyGuestToken(guestToken)));

  if (isGuest) {
    // Configuración (tokens y devices) es exclusiva de administración.
    if (request.nextUrl.pathname.startsWith('/dashboard/settings')) {
      return NextResponse.redirect(new URL('/dashboard/overview', request.url));
    }
    return NextResponse.next();
  }

  // La demo es pública: sin sesión se entra como visitante de solo lectura.
  // El login de administración sigue disponible en /login.
  const demoUrl = new URL('/demo', request.url);
  demoUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(demoUrl);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
