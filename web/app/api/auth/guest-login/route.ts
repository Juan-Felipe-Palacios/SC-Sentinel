// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/auth/guest-login — sesión de demostración de solo lectura.
//
// Demo pública de solo lectura. El device se resuelve del lado servidor:
// SC_GUEST_DEVICE_ID (allowlist) → DEFAULT_DEVICE_ID → primer device. No se
// emite token en el body: la sesión viaja en una cookie httpOnly de 1 h.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GUEST_COOKIE,
  GUEST_TTL_SECONDS,
  createGuestToken,
  guestCookieOptions,
} from '@/lib/auth/guest';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { clientIp } from '@/lib/auth/resolve';
import { resolveGuestDevice } from '@/lib/auth/guest-device';
import { checkGuestLoginLimit, guestRateLimitResponse } from '@/lib/rate-limit/guest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

const GuestLoginSchema = z
  .object({
    deviceId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    ...sessionCookieOptions(false),
    maxAge: 0,
  });
}

export async function POST(request: NextRequest) {
  const loginLimit = checkGuestLoginLimit(clientIp(request));
  if (!loginLimit.allowed) {
    return guestRateLimitResponse(loginLimit.retryAfterSeconds);
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'El cuerpo debe ser JSON válido.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const parsed = GuestLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: 'deviceId inválido.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const demo = await resolveGuestDevice(parsed.data.deviceId);
    if (!demo.deviceId) {
      if (demo.error === 'not_allowed') {
        return NextResponse.json(
          {
            error: 'guest_device_not_allowed',
            message: 'Ese dispositivo no está habilitado para la demo.',
          },
          { status: 403, headers: noStoreHeaders }
        );
      }
      return NextResponse.json(
        {
          error: 'guest_device_unavailable',
          message: 'La demo todavía no tiene un dispositivo disponible.',
        },
        { status: 404, headers: noStoreHeaders }
      );
    }

    const { token } = await createGuestToken(demo.deviceId);
    const response = NextResponse.json(
      {
        ok: true,
        role: 'guest',
        expiresIn: GUEST_TTL_SECONDS,
        permissions: ['read', 'chat'],
      },
      { headers: noStoreHeaders }
    );

    // Una sola sesión activa por navegador: guest no hereda privilegios admin.
    clearAdminCookie(response);
    response.cookies.set(GUEST_COOKIE, token, guestCookieOptions());
    return response;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'guest_login_failed',
        error: error instanceof Error ? error.name : 'unknown',
      })
    );
    return NextResponse.json(
      { error: 'internal_error', message: 'No se pudo iniciar la sesión de visitante.' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
