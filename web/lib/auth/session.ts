// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Sesión admin httpOnly firmada con HS256 (jose). Consumida por middleware,
// route handlers y tests. No importar módulos de node aquí: el middleware
// corre en edge runtime.

import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'sc_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 h base
export const SESSION_REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días

export const SESSION_ISSUER = 'sc-sentinel';

export function getSessionSecret(): Uint8Array {
  const configured = process.env.SC_SESSION_SECRET ?? process.env.ADMIN_SECRET;
  if (configured && configured.length >= 16) {
    return new TextEncoder().encode(configured);
  }
  if (process.env.NODE_ENV === 'development') {
    return new TextEncoder().encode('sc-dev-only-session-secret');
  }
  throw new Error('SC_SESSION_SECRET (o ADMIN_SECRET, mínimo 16 caracteres) es obligatorio fuera de development');
}

export function getSessionTtlSeconds(rememberMe: boolean): number {
  return rememberMe ? SESSION_REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS;
}

export async function createSessionToken(rememberMe: boolean = false): Promise<string> {
  const ttl = getSessionTtlSeconds(rememberMe);
  return new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(SESSION_ISSUER)
    .setExpirationTime(`${ttl}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { issuer: SESSION_ISSUER });
    // Los tokens guest comparten secreto pero no pueden actuar como admin.
    return payload.sub === 'admin' && payload.role !== 'guest';
  } catch {
    return false;
  }
}

export function sessionCookieOptions(rememberMe: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getSessionTtlSeconds(rememberMe),
  };
}