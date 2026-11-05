// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth/session';
import { safeEqual } from '@/lib/auth/secrets';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

const LoginSchema = z.object({
  password: z.string().min(1).max(256),
  rememberMe: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401, headers: noStoreHeaders });
  }

  try {
    const token = await createSessionToken(rememberMe);
    const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(rememberMe));
    return response;
  } catch (error) {
    console.error('POST /api/auth/login: no se pudo firmar la sesión', error);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: noStoreHeaders });
  }
}