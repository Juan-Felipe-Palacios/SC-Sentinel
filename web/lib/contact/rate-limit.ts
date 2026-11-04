// SC-Sentinel — rate limit en memoria para /api/contact (por IP, 10 mensajes por hora).
// En serverless la ventana se reinicia en cold starts: es una barrera anti-abuso, no un límite contractual.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { RATE_LIMIT_PER_HOUR } from './schema';

type Bucket = { count: number; windowStart: number };

// globalThis sobrevive a hot reloads en dev y a múltiples invocaciones en un mismo worker.
const globalStore = globalThis as typeof globalThis & { __scContactRateLimit?: Map<string, Bucket> };
const buckets = globalStore.__scContactRateLimit ?? new Map<string, Bucket>();
if (!globalStore.__scContactRateLimit) globalStore.__scContactRateLimit = buckets;

const WINDOW_MS = 60 * 60 * 1000;
const MAX_KEYS = 1024;

function pruneExpired(now: number) {
  if (buckets.size <= MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
  }
  // Si sigue llena, descartamos las entradas más antiguas.
  if (buckets.size > MAX_KEYS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart);
    for (const [key] of oldest.slice(0, buckets.size - MAX_KEYS)) buckets.delete(key);
  }
}

/** Devuelve true si la IP está dentro de la cuota y registra el hit. */
export function allowContactRequest(ip: string, now: number = Date.now()): boolean {
  pruneExpired(now);
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_HOUR) return false;
  bucket.count += 1;
  return true;
}

/** Segundos restantes de la ventana actual para la IP (para Retry-After). */
export function retryAfterSeconds(ip: string, now: number = Date.now()): number {
  const bucket = buckets.get(ip);
  if (!bucket) return 0;
  return Math.max(0, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000));
}
