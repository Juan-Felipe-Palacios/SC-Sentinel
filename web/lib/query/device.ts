// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { queryRows, defaultQueryDb, type QueryDb } from './db-rows';

/**
 * Resolución single-device v1:
 * 1. device_id explícito (query param), 2. DEFAULT_DEVICE_ID, 3. primer device enrollo, 4. null.
 */
export async function resolveDeviceId(
  requestedDeviceId?: string | null,
  database: QueryDb = defaultQueryDb
): Promise<string | null> {
  if (requestedDeviceId) return requestedDeviceId;
  if (process.env.DEFAULT_DEVICE_ID) return process.env.DEFAULT_DEVICE_ID;

  const rows = await queryRows<{ id: string }>(
    database,
    sql`SELECT id FROM devices ORDER BY enrolled_at ASC LIMIT 1`
  );

  return rows[0]?.id ?? null;
}
