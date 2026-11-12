// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextRequest } from 'next/server';
import {
  LEGACY_ADMIN_PRINCIPAL,
  SESSION_COOKIE,
  readSessionPrincipal,
  type SessionPrincipal,
} from '@/lib/auth/session';
import { safeEqual } from '@/lib/auth/secrets';
import { GUEST_COOKIE } from '@/lib/auth/guest';

export interface AdminAuthResult {
  authenticated: boolean;
  user?: string;
  principal?: SessionPrincipal;
  error?: string;
}

export async function verifyAdminAuth(request: NextRequest): Promise<AdminAuthResult> {
  const adminSecret = process.env.ADMIN_SECRET;

  // 1. Header secret (llamadas directas / tooling)
  const headerSecret = request.headers.get('x-sc-admin-secret');
  if (adminSecret && headerSecret && safeEqual(headerSecret, adminSecret)) {
    return { authenticated: true, user: 'admin_secret', principal: LEGACY_ADMIN_PRINCIPAL };
  }

  // 2. Authorization Bearer
  const authHeader = request.headers.get('authorization');
  if (adminSecret && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && safeEqual(token, adminSecret)) {
      return { authenticated: true, user: 'bearer_admin', principal: LEGACY_ADMIN_PRINCIPAL };
    }
  }

  // 3. Cookie de sesión firmada (dashboard en el browser)
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionCookie) {
    const principal = await readSessionPrincipal(sessionCookie);
    if (principal) {
      return {
        authenticated: true,
        user: principal.kind === 'operator' ? 'operator_session' : 'admin_session',
        principal,
      };
    }
  }

  // 4. Fallback local explícito: exige SC_DEV_AUTH=1 además de no estar en
  //    producción. Si el usuario eligió el modo visitante, se respeta ese rol.
  const devAuthAllowed =
    process.env.NODE_ENV !== 'production' && process.env.SC_DEV_AUTH === '1';
  if (devAuthAllowed && !request.cookies.get(GUEST_COOKIE)?.value) {
    return { authenticated: true, user: 'dev_local', principal: LEGACY_ADMIN_PRINCIPAL };
  }

  return { authenticated: false, error: 'Unauthorized: admin authentication required' };
}
