// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Límites del modo visitante. Reutiliza el token bucket en memoria del ingest
// (ADR-0011); en serverless es una mitigación por instancia, no una cuota global.

import { NextResponse } from 'next/server';
import { checkRateLimit } from './ingest';

export const GUEST_REQUESTS_PER_MINUTE = 100;
export const GUEST_BURST = 30;
export const GUEST_CHAT_PER_MINUTE = 6;
export const GUEST_CHAT_BURST = 3;
export const GUEST_CHAT_PER_HOUR = 30;
export const GUEST_CHAT_HOUR_BURST = 10;
export const GUEST_LOGIN_PER_MINUTE = 10;
export const GUEST_LOGIN_BURST = 5;
export const GUEST_DEMO_PER_MINUTE = 60;
export const GUEST_DEMO_BURST = 20;

export interface GuestLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkGuestRequestLimit(ip: string): GuestLimitResult {
  return checkRateLimit(`guest:req:${ip}`, GUEST_REQUESTS_PER_MINUTE, GUEST_BURST);
}

/**
 * El chat gasta créditos del proveedor de IA: minuto por sesión guest y hora
 * por IP (evita farmear sesiones nuevas desde el mismo origen).
 */
export function checkGuestChatLimit(tokenId: string, ip: string): GuestLimitResult {
  const perMinute = checkRateLimit(
    `guest:chat:min:${tokenId}`,
    GUEST_CHAT_PER_MINUTE,
    GUEST_CHAT_BURST
  );
  if (!perMinute.allowed) return perMinute;

  return checkRateLimit(
    `guest:chat:hour:${ip}`,
    GUEST_CHAT_PER_HOUR / 60,
    GUEST_CHAT_HOUR_BURST
  );
}

export function checkGuestLoginLimit(ip: string): GuestLimitResult {
  return checkRateLimit(`guest:login:${ip}`, GUEST_LOGIN_PER_MINUTE, GUEST_LOGIN_BURST);
}

export function checkGuestDemoLimit(ip: string): GuestLimitResult {
  return checkRateLimit(`guest:demo:${ip}`, GUEST_DEMO_PER_MINUTE, GUEST_DEMO_BURST);
}

export function guestRateLimitResponse(retryAfterSeconds?: number): NextResponse {
  const retryAfter = Math.max(1, retryAfterSeconds ?? 1);
  return NextResponse.json(
    {
      error: 'rate_limited',
      message: `Demasiadas solicitudes. Reintentá en ${retryAfter} s.`,
    },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Retry-After': String(retryAfter),
      },
    }
  );
}
