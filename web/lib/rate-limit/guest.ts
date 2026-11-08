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
/** Presupuesto diario de chat por IP (día calendario UTC): el límite por hora
 *  no evita un uso sostenido de 24 h sobre la cuota free del proveedor. */
export const GUEST_CHAT_PER_DAY = 100;
export const GUEST_LOGIN_PER_MINUTE = 10;
export const GUEST_LOGIN_BURST = 5;
export const GUEST_DEMO_PER_MINUTE = 60;
export const GUEST_DEMO_BURST = 20;

export interface GuestLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Contadores por día calendario (UTC) e IP. En memoria: mitigación por
 *  instancia en serverless, igual que el token bucket (ADR-0011). */
const chatDayBuckets = new Map<string, { day: string; count: number }>();

function chatDayBucket(ip: string): { day: string; count: number } {
  const day = new Date().toISOString().slice(0, 10);
  const key = `guest:chat:day:${ip}`;
  let bucket = chatDayBuckets.get(key);
  if (!bucket || bucket.day !== day) {
    bucket = { day, count: 0 };
    chatDayBuckets.set(key, bucket);
    // Evita que el mapa crezca sin límite con IPs efímeras.
    if (chatDayBuckets.size > 1000) {
      for (const [entryKey, entry] of chatDayBuckets) {
        if (entry.day !== day) chatDayBuckets.delete(entryKey);
      }
    }
  }
  return bucket;
}

/** Solo consulta: el conteo se incrementa en `commitGuestChatDailyLimit` cuando
 *  todas las ventanas permiten la llamada (un rechazo no consume presupuesto). */
function checkGuestChatDailyLimit(ip: string): GuestLimitResult {
  const bucket = chatDayBucket(ip);
  if (bucket.count < GUEST_CHAT_PER_DAY) return { allowed: true };
  const [year, month, day] = bucket.day.split('-').map(Number);
  const nextUtcMidnight = Date.UTC(year, month - 1, day + 1);
  const retryAfterSeconds = Math.max(1, Math.ceil((nextUtcMidnight - Date.now()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

function commitGuestChatDailyLimit(ip: string): void {
  chatDayBucket(ip).count += 1;
}

export function checkGuestRequestLimit(ip: string): GuestLimitResult {
  return checkRateLimit(`guest:req:${ip}`, GUEST_REQUESTS_PER_MINUTE, GUEST_BURST);
}

/**
 * El chat gasta créditos del proveedor de IA: minuto por sesión guest, hora
 * por IP (evita farmear sesiones nuevas desde el mismo origen) y día por IP
 * (presupuesto diario contra la cuota free).
 */
export function checkGuestChatLimit(tokenId: string, ip: string): GuestLimitResult {
  const daily = checkGuestChatDailyLimit(ip);
  if (!daily.allowed) return daily;

  const perMinute = checkRateLimit(
    `guest:chat:min:${tokenId}`,
    GUEST_CHAT_PER_MINUTE,
    GUEST_CHAT_BURST
  );
  if (!perMinute.allowed) return perMinute;

  const perHour = checkRateLimit(
    `guest:chat:hour:${ip}`,
    GUEST_CHAT_PER_HOUR / 60,
    GUEST_CHAT_HOUR_BURST
  );
  if (!perHour.allowed) return perHour;

  commitGuestChatDailyLimit(ip);
  return { allowed: true };
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
