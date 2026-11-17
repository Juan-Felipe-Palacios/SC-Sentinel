// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { queryRows, defaultQueryDb, type QueryDb } from './db-rows';

/**
 * Resolución single-device v1:
 * 1. device_id explícito (query param), 2. DEFAULT_DEVICE_ID,
 * 3. device con la ventana más reciente, 4. device activo más nuevo, 5. null.
 *
 * El orden anterior (`enrolled_at ASC`) elegía el device demo viejo en
 * producción y dejaba el panel/cron mirando datos históricos sin tráfico.
 */
export async function resolveDeviceId(
  requestedDeviceId?: string | null,
  database: QueryDb = defaultQueryDb
): Promise<string | null> {
  if (requestedDeviceId) return requestedDeviceId;
  if (process.env.DEFAULT_DEVICE_ID) return process.env.DEFAULT_DEVICE_ID;

  const rows = await queryRows<{ id: string }>(
    database,
    sql`SELECT d.id
        FROM devices d
        LEFT JOIN LATERAL (
          SELECT MAX(fw.start_at) AS last_window
          FROM flow_windows fw
          WHERE fw.device_id = d.id
        ) recent ON true
        WHERE d.status <> 'revoked'
        ORDER BY recent.last_window DESC NULLS LAST, d.enrolled_at DESC
        LIMIT 1`
  );

  return rows[0]?.id ?? null;
}
