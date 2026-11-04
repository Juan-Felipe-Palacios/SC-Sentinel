// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Sesión admin httpOnly firmada con HS256 (jose). Consumida por middleware,
// route handlers y tests. No importar módulos de node aquí: el middleware
// corre en edge runtime.

import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'sc_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 h

const SESSION_ISSUER = 'sc-sentinel';

function sessionSecret(): Uint8Array {
  const configured = process.env.SC_SESSION_SECRET ?? process.env.ADMIN_SECRET;
  if (configured && configured.length >= 16) {
    return new TextEncoder().encode(configured);
  }
  if (process.env.NODE_ENV === 'development') {
    return new TextEncoder().encode('sc-dev-only-session-secret');
  }
  throw new Error('SC_SESSION_SECRET (o ADMIN_SECRET, mínimo 16 caracteres) es obligatorio fuera de development');
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(SESSION_ISSUER)
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, sessionSecret(), { issuer: SESSION_ISSUER });
    return true;
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
