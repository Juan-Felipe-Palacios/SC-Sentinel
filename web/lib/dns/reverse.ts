// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// DNS inverso de los hosts visibles en el dashboard.
//
// El agente solo envía IPs (o nada, si anonimiza); el nombre de host se resuelve
// acá, en el servidor, con caché en memoria y timeout corto. Si la resolución
// falla o tarda, el dashboard muestra la IP: nunca bloquea la respuesta.

import { promises as dns } from 'node:dns';

const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 500;
const LOOKUP_TIMEOUT_MS = 800;

interface CacheEntry {
  hostname: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Rangos privados/reservados: no tiene sentido resolverlos por DNS inverso. */
export function isPublicIp(ip: string): boolean {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return !(
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    );
  }
  const octets = ip.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function readCache(ip: string, now: number): CacheEntry | undefined {
  const entry = cache.get(ip);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(ip);
    return undefined;
  }
  return entry;
}

function writeCache(ip: string, hostname: string | null, now: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Desalojo FIFO simple: el mapa conserva orden de inserción.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(ip, { hostname, expiresAt: now + CACHE_TTL_MS });
}

/** Nombre de host de una IP, o null si no se puede resolver. Nunca lanza. */
export async function reverseHostname(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed || !isPublicIp(trimmed)) return null;

  const now = Date.now();
  const cached = readCache(trimmed, now);
  if (cached) return cached.hostname;

  let hostname: string | null = null;
  try {
    const names = await Promise.race([
      dns.reverse(trimmed),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), LOOKUP_TIMEOUT_MS)),
    ]);
    hostname = names.find((name) => name && name.length > 0) ?? null;
  } catch {
    hostname = null;
  }

  writeCache(trimmed, hostname, now);
  return hostname;
}

/** Añade `hostname` a cada fila con `ip`, resolviendo en paralelo. */
export async function attachHostnames<T extends { ip: string | null }>(
  rows: T[]
): Promise<Array<T & { hostname: string | null }>> {
  return Promise.all(
    rows.map(async (row) => ({ ...row, hostname: await reverseHostname(row.ip) }))
  );
}
