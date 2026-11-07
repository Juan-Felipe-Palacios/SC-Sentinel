// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { safeEqual } from '@/lib/auth/secrets';
import { GUEST_COOKIE } from '@/lib/auth/guest';

export interface AdminAuthResult {
  authenticated: boolean;
  user?: string;
  error?: string;
}

export async function verifyAdminAuth(request: NextRequest): Promise<AdminAuthResult> {
  const adminSecret = process.env.ADMIN_SECRET;

  // 1. Header secret (llamadas directas / tooling)
  const headerSecret = request.headers.get('x-sc-admin-secret');
  if (adminSecret && headerSecret && safeEqual(headerSecret, adminSecret)) {
    return { authenticated: true, user: 'admin_secret' };
  }

  // 2. Authorization Bearer
  const authHeader = request.headers.get('authorization');
  if (adminSecret && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && safeEqual(token, adminSecret)) {
      return { authenticated: true, user: 'bearer_admin' };
    }
  }

  // 3. Cookie de sesión firmada (dashboard en el browser)
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionCookie && (await verifySessionToken(sessionCookie))) {
    return { authenticated: true, user: 'admin_session' };
  }

  // 4. Fallback de desarrollo cuando no hay secreto configurado. Si el usuario
  //    eligió explícitamente el modo visitante, se respeta ese rol.
  if (
    process.env.NODE_ENV === 'development' &&
    !request.cookies.get(GUEST_COOKIE)?.value
  ) {
    return { authenticated: true, user: 'dev_local' };
  }

  return { authenticated: false, error: 'Unauthorized: admin authentication required' };
}
