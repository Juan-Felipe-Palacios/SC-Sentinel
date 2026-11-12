// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Rol de la sesión para el layout del dashboard (server components).

import { cookies } from 'next/headers';
import { SESSION_COOKIE, readSessionPrincipal, type SessionPrincipal } from '@/lib/auth/session';
import { GUEST_COOKIE, verifyGuestToken, type GuestSession } from '@/lib/auth/guest';

export type DashboardAuth =
  | { role: 'admin'; principal: SessionPrincipal }
  | { role: 'guest'; guest: GuestSession };

/** Admin gana si por alguna razón conviven ambas cookies. */
export async function getDashboardAuth(): Promise<DashboardAuth | null> {
  const store = await cookies();

  const sessionToken = store.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    const principal = await readSessionPrincipal(sessionToken);
    if (principal) return { role: 'admin', principal };
  }

  const guestToken = store.get(GUEST_COOKIE)?.value;
  if (guestToken) {
    const guest = await verifyGuestToken(guestToken);
    if (guest) return { role: 'guest', guest };
  }

  return null;
}
