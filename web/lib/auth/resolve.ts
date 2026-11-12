// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Autorización por rol para route handlers. Solo node runtime (usa admin.ts).

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { GUEST_COOKIE, verifyGuestToken, type GuestSession } from '@/lib/auth/guest';
import type { SessionPrincipal } from '@/lib/auth/session';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export type AuthRole = 'admin' | 'guest';

export type ResolvedAuth =
  | { role: 'admin'; principal?: SessionPrincipal }
  | { role: 'guest'; guest: GuestSession };

export type Authorization =
  | { ok: true; auth: ResolvedAuth }
  | { ok: false; response: NextResponse };

/**
 * Admin primero (cookie sc_session / secret / Bearer). Si no hay admin, se
 * evalúa la cookie guest. Un guest autenticado en una ruta solo-admin recibe
 * 403 (no 401): las credenciales son válidas, el permiso no.
 */
export async function authorize(
  request: NextRequest,
  options: { allowGuest?: boolean } = {}
): Promise<Authorization> {
  const admin = await verifyAdminAuth(request);
  if (admin.authenticated) {
    return { ok: true, auth: { role: 'admin', principal: admin.principal } };
  }

  const guestToken = request.cookies.get(GUEST_COOKIE)?.value;
  const guest = guestToken ? await verifyGuestToken(guestToken) : null;

  if (guest) {
    if (!options.allowGuest) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'forbidden', message: 'El modo visitante es solo lectura.' },
          { status: 403, headers: noStoreHeaders }
        ),
      };
    }
    return { ok: true, auth: { role: 'guest', guest } };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: noStoreHeaders }
    ),
  };
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
