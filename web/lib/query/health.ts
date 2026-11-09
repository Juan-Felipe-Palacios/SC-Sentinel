// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';

export interface HealthMetric {
  device_id: string | null;
  capture_status: string | null;
  packets_seen: number;
  packets_dropped: number;
  parse_errors: number;
  queue_depth: number | null;
  spool_bytes: number | null;
  collector_packets_received: number | null;
  collector_packets_dropped: number | null;
  collector_parse_errors: number | null;
  collector_templates_cached: number | null;
  collector_flows_normalized: number | null;
  last_error: string | null;
  recorded_at: string | null;
}

interface HealthRow {
  device_id: string;
  capture_status: string;
  packets_seen: number | string | null;
  packets_dropped: number | string | null;
  parse_errors: number | string | null;
  queue_depth: number | string | null;
  spool_bytes: number | string | null;
  collector_packets_received: number | string | null;
  collector_packets_dropped: number | string | null;
  collector_parse_errors: number | string | null;
  collector_templates_cached: number | string | null;
  collector_flows_normalized: number | string | null;
  last_error: string | null;
  recorded_at: Date | string | null;
}

function emptyHealth(deviceId: string | null): HealthMetric {
  return {
    device_id: deviceId,
    capture_status: null,
    packets_seen: 0,
    packets_dropped: 0,
    parse_errors: 0,
    queue_depth: null,
    spool_bytes: null,
    collector_packets_received: null,
    collector_packets_dropped: null,
    collector_parse_errors: null,
    collector_templates_cached: null,
    collector_flows_normalized: null,
    last_error: null,
    recorded_at: null,
  };
}

function bigintOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function queryHealth(
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb
): Promise<HealthMetric> {
  if (!deviceId) return emptyHealth(null);

  const rows = await queryRows<HealthRow>(
    database,
    sql`SELECT device_id,
               capture_status,
               packets_seen,
               packets_dropped,
               parse_errors,
               queue_depth,
               spool_bytes,
               collector_packets_received,
               collector_packets_dropped,
               collector_parse_errors,
               collector_templates_cached,
               collector_flows_normalized,
               last_error,
               recorded_at
        FROM agent_health
        WHERE device_id = ${deviceId}
        ORDER BY recorded_at DESC
        LIMIT 1`
  );

  const row = rows[0];
  if (!row) return emptyHealth(deviceId);

  return {
    device_id: row.device_id,
    capture_status: row.capture_status,
    packets_seen: bigintToNumber(row.packets_seen),
    packets_dropped: bigintToNumber(row.packets_dropped),
    parse_errors: bigintToNumber(row.parse_errors),
    queue_depth: bigintOrNull(row.queue_depth),
    spool_bytes: bigintOrNull(row.spool_bytes),
    collector_packets_received: bigintOrNull(row.collector_packets_received),
    collector_packets_dropped: bigintOrNull(row.collector_packets_dropped),
    collector_parse_errors: bigintOrNull(row.collector_parse_errors),
    collector_templates_cached: bigintOrNull(row.collector_templates_cached),
    collector_flows_normalized: bigintOrNull(row.collector_flows_normalized),
    last_error: row.last_error,
    recorded_at: isoOrNull(row.recorded_at),
  };
}
