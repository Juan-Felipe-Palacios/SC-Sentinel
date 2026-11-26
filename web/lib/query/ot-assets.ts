// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Read model `ot_assets` (M6 OT, E3): inventario de activos observados por
// dispositivo. Sólo lectura y sólo columnas de clase B: `host_key` es el HMAC
// del nodo, nunca la IP ni la MAC. `oui_prefix` queda fuera de la respuesta.

import { sql } from 'drizzle-orm';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';

export const OT_ASSETS_DEFAULT_LIMIT = 100;
export const OT_ASSETS_MAX_LIMIT = 200;

export interface OtAssetRecord {
  id: string;
  device_id: string;
  host_key: string;
  first_seen: string;
  last_seen: string;
  seen_windows: number;
  role: string;
  protocols: unknown[];
  vendor: string;
  vendor_source: string;
  model_hint: string | null;
  zone: string | null;
  label: string | null;
  baseline_state: string;
  peers: unknown[];
  risk_flags: unknown[];
}

interface OtAssetRow {
  id: string;
  device_id: string;
  host_key: string;
  first_seen: Date | string;
  last_seen: Date | string;
  seen_windows: number | string;
  role: string;
  protocols: unknown;
  vendor: string;
  vendor_source: string;
  model_hint: string | null;
  zone: string | null;
  label: string | null;
  baseline_state: string;
  peers: unknown;
  risk_flags: unknown;
}

/** jsonb puede llegar ya parseado (driver http) o como texto (PGlite). */
function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(row: OtAssetRow): OtAssetRecord {
  return {
    id: row.id,
    device_id: row.device_id,
    host_key: row.host_key,
    first_seen: isoOrNull(row.first_seen) ?? String(row.first_seen),
    last_seen: isoOrNull(row.last_seen) ?? String(row.last_seen),
    seen_windows: bigintToNumber(row.seen_windows),
    role: row.role,
    protocols: toArray(row.protocols),
    vendor: row.vendor,
    vendor_source: row.vendor_source,
    model_hint: row.model_hint ?? null,
    zone: row.zone ?? null,
    label: row.label ?? null,
    baseline_state: row.baseline_state,
    peers: toArray(row.peers),
    risk_flags: toArray(row.risk_flags),
  };
}

/**
 * Activos OT de un dispositivo, del más reciente al más antiguo.
 * `limit` ya viene validado por el handler (1..OT_ASSETS_MAX_LIMIT).
 */
export async function listOtAssets(
  deviceId: string,
  options: { limit?: number } = {},
  database: QueryDb = defaultQueryDb
): Promise<OtAssetRecord[]> {
  const limit = Math.min(
    Math.max(options.limit ?? OT_ASSETS_DEFAULT_LIMIT, 1),
    OT_ASSETS_MAX_LIMIT
  );

  const rows = await queryRows<OtAssetRow>(
    database,
    sql`SELECT id, device_id, host_key, first_seen, last_seen, seen_windows,
               role, protocols, vendor, vendor_source, model_hint, zone, label,
               baseline_state, peers, risk_flags
        FROM ot_assets
        WHERE device_id = ${deviceId}
        ORDER BY last_seen DESC, host_key ASC
        LIMIT ${limit}`
  );

  return rows.map(mapRow);
}
