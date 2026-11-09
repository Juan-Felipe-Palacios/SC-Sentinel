// web/lib/query/export.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Consultas exclusivas de exportación con límite 10000. Reutilizan el SQL de
// hosts/alerts pero con LIMIT 10001 para detectar desborde sin falsos positivos.
// El dashboard sigue usando HOSTS_LIMIT=50 / ALERTS_LIMIT=100.

import { sql } from 'drizzle-orm';
import { getRangeBounds } from './range';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';
import type { HostMetricItem } from './hosts';
import type { AlertItem } from './alerts';

export const EXPORT_ROW_LIMIT = 10_000;
// LIMIT 10001: si el resultado trae 10001, hay más de 10000 y el route responde 413.
const LIMIT_WITH_OVERFLOW = EXPORT_ROW_LIMIT + 1;

export class ExportTooLargeError extends Error {
  status = 413;
  constructor() {
    super('Dataset demasiado grande, filtra por fecha');
    this.name = 'ExportTooLargeError';
  }
}

export interface ExportHostsResult { rows: number; hosts: HostMetricItem[] }
export interface ExportAlertsResult { rows: number; alerts: AlertItem[] }
export interface ExportWindowItem { window_id: string; start_at: string | null; end_at: string | null; sequence: number }
export interface ExportWindowsResult { rows: number; windows: ExportWindowItem[] }

interface HostRow {
  host_key: string; ip: string | null; country: string | null;
  bytes_in: number | string | null; bytes_out: number | string | null; packets: number | string | null;
  risk_score: string | null; first_seen: Date | string | null; last_seen: Date | string | null;
}

function parseRiskScore(value: string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function queryHostsExport(range: QueryRange = '1h', deviceId?: string | null, database: QueryDb = defaultQueryDb, now: Date = new Date()): Promise<ExportHostsResult> {
  if (!deviceId) return { rows: 0, hosts: [] };
  const { start, end } = getRangeBounds(range, now);
  const rows = await queryRows<HostRow>(
    database,
    sql`SELECT hs.host_key,
               (array_agg(hs.ip_display ORDER BY fw.start_at DESC) FILTER (WHERE hs.ip_display IS NOT NULL))[1] AS ip,
               (array_agg(hs.country ORDER BY fw.start_at DESC) FILTER (WHERE hs.country IS NOT NULL))[1] AS country,
               COALESCE(SUM(hs.bytes_in), 0)::bigint AS bytes_in,
               COALESCE(SUM(hs.bytes_out), 0)::bigint AS bytes_out,
               COALESCE(SUM(hs.packets), 0)::bigint AS packets,
               (array_agg(hs.risk_score ORDER BY fw.start_at DESC) FILTER (WHERE hs.risk_score IS NOT NULL))[1] AS risk_score,
               MIN(fw.start_at) AS first_seen,
               MAX(fw.end_at) AS last_seen
        FROM host_stats hs
        INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
        WHERE fw.device_id = ${deviceId}
          AND fw.start_at >= ${start.toISOString()}::timestamptz
          AND fw.start_at < ${end.toISOString()}::timestamptz
        GROUP BY hs.host_key
        ORDER BY SUM(hs.bytes_in + hs.bytes_out) DESC
        LIMIT ${LIMIT_WITH_OVERFLOW}`
  );
  const hosts = rows.map((row) => ({
    host_key: row.host_key,
    ip: row.ip ?? null,
    country: row.country,
    bytes_in: bigintToNumber(row.bytes_in),
    bytes_out: bigintToNumber(row.bytes_out),
    packets: bigintToNumber(row.packets),
    risk_score: parseRiskScore(row.risk_score),
    first_seen: isoOrNull(row.first_seen),
    last_seen: isoOrNull(row.last_seen),
  }));
  if (hosts.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError();
  return { rows: hosts.length, hosts };
}

export async function queryAlertsExport(range: QueryRange = '1h', deviceId?: string | null, database: QueryDb = defaultQueryDb, now: Date = new Date()): Promise<ExportAlertsResult> {
  if (!deviceId) return { rows: 0, alerts: [] };
  const { start, end } = getRangeBounds(range, now);
  const rows = await queryRows<{ id: string; window_id: string; rule_id: string; severity: string; title: string; description: string | null; evidence: unknown; created_at: Date | string | null }>(
    database,
    sql`SELECT a.id, a.window_id, a.rule_id, a.severity, a.title, a.description, a.evidence, fw.start_at AS created_at
        FROM alerts a
        INNER JOIN flow_windows fw ON fw.window_id = a.window_id
        WHERE fw.device_id = ${deviceId}
          AND fw.start_at >= ${start.toISOString()}::timestamptz
          AND fw.start_at < ${end.toISOString()}::timestamptz
        ORDER BY fw.start_at DESC
        LIMIT ${LIMIT_WITH_OVERFLOW}`
  );
  const alerts: AlertItem[] = rows.map((row) => ({
    id: row.id, window_id: row.window_id, rule_id: row.rule_id, severity: row.severity, title: row.title,
    description: row.description, evidence: null, created_at: isoOrNull(row.created_at),
  }));
  if (alerts.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError();
  return { rows: alerts.length, alerts };
}

export async function queryWindowsExport(range: QueryRange = '1h', deviceId?: string | null, database: QueryDb = defaultQueryDb, now: Date = new Date()): Promise<ExportWindowsResult> {
  if (!deviceId) return { rows: 0, windows: [] };
  const { start, end } = getRangeBounds(range, now);
  const rows = await queryRows<{ window_id: string; start_at: Date | string | null; end_at: Date | string | null; sequence: number | string | null }>(
    database,
    sql`SELECT window_id, start_at, end_at, sequence
        FROM flow_windows
        WHERE device_id = ${deviceId}
          AND start_at >= ${start.toISOString()}::timestamptz
          AND start_at < ${end.toISOString()}::timestamptz
        ORDER BY start_at ASC
        LIMIT ${LIMIT_WITH_OVERFLOW}`
  );
  const windows = rows.map((row) => ({
    window_id: row.window_id,
    start_at: isoOrNull(row.start_at),
    end_at: isoOrNull(row.end_at),
    sequence: bigintToNumber(row.sequence),
  }));
  if (windows.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError();
  return { rows: windows.length, windows };
}
