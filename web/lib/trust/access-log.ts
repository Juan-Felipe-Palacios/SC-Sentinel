// web/lib/trust/access-log.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { createHash, randomUUID } from 'node:crypto';
import { db, trustPageAccessLogs } from '@/lib/db';

/** IPv4 → x.y.*.*; IPv6 → primer hexteto + :*; resto → unknown. */
export function anonymizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (!trimmed || trimmed === 'unknown') return 'unknown';
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(trimmed);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.*.*`;
  const colon = trimmed.indexOf(':');
  if (colon > 0) return `${trimmed.slice(0, colon)}:*`;
  return 'unknown';
}

export function hashUserAgent(userAgent: string): string {
  if (!userAgent) return '';
  return createHash('sha256').update(userAgent).digest('hex');
}

export async function logTrustAccess(tokenHash: string, ip: string, userAgent: string): Promise<void> {
  try {
    await db.insert(trustPageAccessLogs).values({
      id: `ta_${randomUUID()}`,
      tokenHash,
      ipAnon: anonymizeIp(ip),
      userAgentHash: hashUserAgent(userAgent),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'trust_access_log_failed', error: error instanceof Error ? error.name : 'unknown' }));
  }
}
