// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth/session';
import { GUEST_COOKIE, guestCookieOptions } from '@/lib/auth/guest';
import { safeEqual } from '@/lib/auth/secrets';
import { clientIp } from '@/lib/auth/resolve';
import { checkRateLimit } from '@/lib/rate-limit/ingest';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

// 5 intentos por minuto y por IP; el burst inicial es 5.
const LOGIN_RATE_PER_MINUTE = 5;
const LOGIN_BURST = 5;
// Iguala el tiempo de respuesta entre "sin secreto configurado" y "contraseña mala".
const FAILED_ATTEMPT_DELAY_MS = 250;

const LoginSchema = z.object({
  password: z.string().min(1).max(256),
  rememberMe: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(
    `auth:login:${clientIp(request)}`,
    LOGIN_RATE_PER_MINUTE,
    LOGIN_BURST
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      {
        status: 429,
        headers: {
          ...noStoreHeaders,
          'Retry-After': String(limit.retryAfterSeconds ?? 60),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStoreHeaders });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: 'password requerido' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const adminSecret = process.env.ADMIN_SECRET;
  const { password, rememberMe: rememberMeInput } = parsed.data;
  const rememberMe = rememberMeInput !== undefined ? rememberMeInput : false;

  // Sin ADMIN_SECRET solo se admite en desarrollo local (acepta cualquier password no vacío)
  const accepted = adminSecret
    ? safeEqual(password, adminSecret)
    : process.env.NODE_ENV === 'development';

  if (!accepted) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401, headers: noStoreHeaders });
  }

  try {
    const token = await createSessionToken(rememberMe);
    const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders });
    // Admin reemplaza cualquier sesión de visitante previa.
    response.cookies.set(GUEST_COOKIE, '', { ...guestCookieOptions(), maxAge: 0 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(rememberMe));
    return response;
  } catch (error) {
    console.error('POST /api/auth/login: no se pudo firmar la sesión', error);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: noStoreHeaders });
  }
}