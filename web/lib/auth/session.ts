// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Sesión admin httpOnly firmada con HS256 (jose). Consumida por middleware,
// route handlers y tests. No importar módulos de node aquí: el middleware
// corre en edge runtime.

import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'sc_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 h base
export const SESSION_REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días

export const SESSION_ISSUER = 'sc-sentinel';

/** Identidad estable del actor autenticado que consume el ciclo de alertas. */
export interface SessionPrincipal {
  kind: 'admin' | 'operator';
  operatorId: string | null;
  name: string;
  email: string | null;
}

export const LEGACY_ADMIN_PRINCIPAL: SessionPrincipal = {
  kind: 'admin',
  operatorId: null,
  name: 'Administrador',
  email: null,
};

export interface OperatorSessionIdentity {
  id: string;
  name: string;
  email: string;
}

export function getSessionSecret(): Uint8Array {
  const configured = process.env.SC_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) {
    return new TextEncoder().encode(configured);
  }
  if (process.env.NODE_ENV === 'development' && !configured) {
    return new TextEncoder().encode('sc-dev-only-session-secret');
  }
  throw new Error(
    'SC_SESSION_SECRET (mínimo 32 caracteres) es obligatorio fuera de development; no reutilizar ADMIN_SECRET'
  );
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

export async function createOperatorSessionToken(
  operator: OperatorSessionIdentity,
  rememberMe: boolean = false
): Promise<string> {
  const ttl = getSessionTtlSeconds(rememberMe);
  return new SignJWT({ role: 'operator', name: operator.name, email: operator.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(operator.id)
    .setIssuedAt()
    .setIssuer(SESSION_ISSUER)
    .setExpirationTime(`${ttl}s`)
    .sign(getSessionSecret());
}

export async function readSessionPrincipal(token: string): Promise<SessionPrincipal | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { issuer: SESSION_ISSUER });

    // Los tokens guest comparten secreto pero no pueden actuar como admin.
    if (payload.role === 'guest') return null;

    if (payload.role === 'operator') {
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.name !== 'string' ||
        typeof payload.email !== 'string'
      ) {
        return null;
      }
      return {
        kind: 'operator',
        operatorId: payload.sub,
        name: payload.name,
        email: payload.email,
      };
    }

    return payload.sub === 'admin' ? LEGACY_ADMIN_PRINCIPAL : null;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string): Promise<boolean> {
  return (await readSessionPrincipal(token)) !== null;
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