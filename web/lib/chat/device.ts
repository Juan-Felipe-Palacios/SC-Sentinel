// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Resolución del device para el chatbot. Solo admin autenticado llega hasta acá;
// el id se toma del query param o del device por defecto, nunca de `body.context`.

import { sql } from 'drizzle-orm';
import { resolveDeviceId } from '@/lib/query/device';
import { defaultQueryDb, queryRows, type QueryDb } from '@/lib/query/db-rows';

export async function resolveChatDeviceId(
  requestedDeviceId?: string | null,
  database: QueryDb = defaultQueryDb
): Promise<string | null> {
  const resolved = await resolveDeviceId(requestedDeviceId, database);
  if (!resolved) return null;

  const rows = await queryRows<{ id: string }>(
    database,
    sql`SELECT id FROM devices WHERE id = ${resolved} LIMIT 1`
  );
  return rows[0]?.id ?? null;
}
