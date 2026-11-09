// web/lib/trust/leak-alert.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Alerta de posible filtración: >1000 accesos en 24h por token (log + webhook opcional).
import { sql } from 'drizzle-orm';
import { defaultQueryDb, queryRows, type QueryDb } from '@/lib/query/db-rows';

export const LEAK_THRESHOLD_24H = 1000;
export const LEAK_HEADER = 'x-trust-leak-alert';

export async function maybeAlertLeak(
  tokenHash: string,
  database: QueryDb = defaultQueryDb,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = await queryRows<{ total: string }>(
      database,
      sql`SELECT COUNT(*)::text AS total FROM trust_page_access_logs
          WHERE token_hash = ${tokenHash} AND created_at >= ${since}::timestamptz`,
    );
    const total = Number(rows[0]?.total ?? 0);
    if (total <= LEAK_THRESHOLD_24H) return;
    console.warn(JSON.stringify({ event: 'trust_leak_suspected', token_hash_prefix: tokenHash.slice(0, 12), accesses_24h: total }));
    const webhook = env.TRUST_ALERT_WEBHOOK_URL;
    if (webhook) {
      await fetchImpl(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [LEAK_HEADER]: '1' },
        body: JSON.stringify({ type: 'trust_leak_suspected', token_hash_prefix: tokenHash.slice(0, 12), accesses_24h: total }),
      }).catch(() => undefined);
    }
  } catch {
    // best-effort
  }
}
