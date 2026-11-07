// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /demo — entrada pública: crea una sesión de solo lectura y entra al panel.
// Pensado para que cualquiera pueda evaluar el proyecto sin credenciales.

import { NextRequest, NextResponse } from 'next/server';
import { GUEST_COOKIE, createGuestToken, guestCookieOptions } from '@/lib/auth/guest';
import { resolveGuestDevice } from '@/lib/auth/guest-device';
import { clientIp } from '@/lib/auth/resolve';
import { checkGuestDemoLimit } from '@/lib/rate-limit/guest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeNext(value: string | null): string {
  if (value && value.startsWith('/dashboard') && !value.startsWith('//')) return value;
  return '/dashboard/overview';
}

function redirectTo(request: NextRequest, path: string, setCookie?: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  if (setCookie) {
    response.cookies.set(GUEST_COOKIE, setCookie, guestCookieOptions());
  }
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const target = safeNext(searchParams.get('next'));

  const limit = checkGuestDemoLimit(clientIp(request));
  if (!limit.allowed) {
    return redirectTo(request, '/login?demo=rate_limited');
  }

  try {
    const demo = await resolveGuestDevice();
    if (!demo.deviceId) {
      return redirectTo(request, '/login?demo=unavailable');
    }

    const { token } = await createGuestToken(demo.deviceId);
    return redirectTo(request, target, token);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'demo_entry_failed',
        error: error instanceof Error ? error.name : 'unknown',
      })
    );
    return redirectTo(request, '/login?demo=error');
  }
}
