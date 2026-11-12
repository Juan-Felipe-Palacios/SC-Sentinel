// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_COOKIE,
  createOperatorSessionToken,
  createSessionToken,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { GUEST_COOKIE, guestCookieOptions } from '@/lib/auth/guest';
import { normalizeOperatorEmail, verifyOperatorPassword } from '@/lib/auth/operator-password';
import { safeEqual } from '@/lib/auth/secrets';
import { clientIp } from '@/lib/auth/resolve';
import { findActiveOperatorByEmail, markOperatorLogin } from '@/lib/query/operators';
import { checkRateLimit } from '@/lib/rate-limit/ingest';
import { logServerError } from '@/lib/logging/error';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };
const LOGIN_RATE_PER_MINUTE = 5;
const LOGIN_BURST = 5;
const FAILED_ATTEMPT_DELAY_MS = 250;

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  password: z.string().min(1).max(256),
  rememberMe: z.boolean().optional(),
});

async function invalidCredentials() {
  await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
  return NextResponse.json({ error: 'invalid_credentials' }, { status: 401, headers: noStoreHeaders });
}

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
      { error: 'bad_request', message: 'email y password requeridos' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const { password, rememberMe: rememberMeInput, email: emailInput } = parsed.data;
  const rememberMe = rememberMeInput !== undefined ? rememberMeInput : false;
  const email = emailInput ? normalizeOperatorEmail(emailInput) : null;

  try {
    let token: string;
    if (email) {
      const operator = await findActiveOperatorByEmail(email);
      const valid = operator ? await verifyOperatorPassword(password, operator.passwordHash) : false;
      if (!operator || !valid) return invalidCredentials();
      token = await createOperatorSessionToken(operator, rememberMe);
      await markOperatorLogin(operator.id).catch((error) =>
        logServerError('operator_last_login_failed', error)
      );
    } else {
      const adminSecret = process.env.ADMIN_SECRET;
      const devAuthEnabled =
        process.env.NODE_ENV !== 'production' && process.env.SC_DEV_AUTH === '1';
      const accepted = adminSecret ? safeEqual(password, adminSecret) : devAuthEnabled;
      if (!accepted) return invalidCredentials();
      token = await createSessionToken(rememberMe);
    }

    const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders });
    response.cookies.set(GUEST_COOKIE, '', { ...guestCookieOptions(), maxAge: 0 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(rememberMe));
    return response;
  } catch (error) {
    logServerError('login_session_failed', error);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: noStoreHeaders });
  }
}