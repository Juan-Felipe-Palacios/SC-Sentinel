// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Sesión de visitante (solo lectura): JWT de 1 h en cookie httpOnly.
// Sin imports de Node para poder verificar también desde el middleware (edge).

import { SignJWT, jwtVerify } from 'jose';
import { SESSION_ISSUER, getSessionSecret } from '@/lib/auth/session';

export const GUEST_COOKIE = 'sc_guest';
export const GUEST_TTL_SECONDS = 60 * 60; // 1 h
export const GUEST_AUDIENCE = 'guest';

export interface GuestSession {
  deviceId: string;
  expiresAt: number;
  tokenId: string;
}

export interface CreatedGuestToken {
  token: string;
  expiresAt: number;
  tokenId: string;
}

function newTokenId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Firma un token guest acotado a un device. El device se resuelve del lado
 * servidor contra la allowlist; nunca se acepta un id arbitrario del cliente.
 */
export async function createGuestToken(deviceId: string): Promise<CreatedGuestToken> {
  const tokenId = newTokenId();
  const expiresAt = Math.floor(Date.now() / 1000) + GUEST_TTL_SECONDS;
  const token = await new SignJWT({ role: 'guest', deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('guest')
    .setIssuer(SESSION_ISSUER)
    .setAudience(GUEST_AUDIENCE)
    .setJti(tokenId)
    .setIssuedAt()
    .setExpirationTime(`${GUEST_TTL_SECONDS}s`)
    .sign(getSessionSecret());

  return { token, expiresAt: expiresAt * 1000, tokenId };
}

/** Verifica firma, expiración, audiencia y rol. Devuelve null ante cualquier fallo. */
export async function verifyGuestToken(token: string): Promise<GuestSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      issuer: SESSION_ISSUER,
      audience: GUEST_AUDIENCE,
    });

    if (payload.sub !== 'guest' || payload.role !== 'guest') return null;
    if (typeof payload.deviceId !== 'string' || payload.deviceId.length === 0) return null;
    if (typeof payload.exp !== 'number' || typeof payload.jti !== 'string') return null;

    return {
      deviceId: payload.deviceId,
      expiresAt: payload.exp * 1000,
      tokenId: payload.jti,
    };
  } catch {
    return null;
  }
}

/**
 * Cookie de sesión, sin `maxAge`: no sobrevive al cierre del navegador.
 * La expiración real la impone el JWT (1 h).
 */
export function guestCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}
