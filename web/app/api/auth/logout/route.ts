// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(false), maxAge: 0 });
  return response;
}