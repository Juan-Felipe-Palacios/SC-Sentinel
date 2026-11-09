// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Drill-down nivel 3: actividad de un host ventana por ventana dentro del período.
// El esquema no guarda conexiones individuales, así que la unidad es la ventana
// agregada (30 s) y las alertas se correlacionan por `window_id`, no por host.

import { sql } from 'drizzle-orm';
import { getRangeBounds, type RangeBounds } from './range';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';

export const HOST_WINDOWS_LIMIT = 5000;

export interface HostDetailPoint {
  /** Inicio de la ventana agregada que aportó estos bytes. */
  timestamp: string;
  bytes_in: number;
  bytes_out: number;
  packets: number;
  /** Alertas emitidas en esa ventana (de cualquier host): correlación temporal. */
  alert_count: number;
}

export interface HostDetailResult {
  range: QueryRange;
  host_key: string;
  ip: string | null;
  country: string | null;
  risk_score: number | null;
  period: { start: string; end: string };
  totals: {
    bytes_in: number;
    bytes_out: number;
    packets: number;
    windows_count: number;
    alerts_count: number;
  };
  series: HostDetailPoint[];
}

interface HostWindowRow {
  start_at: Date | string | null;
  ip: string | null;
  country: string | null;
  risk_score: string | null;
  bytes_in: number | string | null;
  bytes_out: number | string | null;
  packets: number | string | null;
  alert_count: number | string | null;
}

function parseRiskScore(value: string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function emptyHostDetail(
  hostKey: string,
  range: QueryRange,
  bounds: RangeBounds
): HostDetailResult {
  return {
    range,
    host_key: hostKey,
    ip: null,
    country: null,
    risk_score: null,
    period: { start: bounds.start.toISOString(), end: bounds.end.toISOString() },
    totals: { bytes_in: 0, bytes_out: 0, packets: 0, windows_count: 0, alerts_count: 0 },
    series: [],
  };
}

export async function queryHostDetail(
  hostKey: string,
  range: QueryRange = '24h',
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date(),
  bounds?: RangeBounds
): Promise<HostDetailResult> {
  const window = bounds ?? getRangeBounds(range, now);
  const empty = emptyHostDetail(hostKey, range, window);
  if (!deviceId || !hostKey) return empty;

  const rows = await queryRows<HostWindowRow>(
    database,
    sql`SELECT fw.start_at AS start_at,
               hs.ip_display AS ip,
               hs.country AS country,
               hs.risk_score AS risk_score,
               hs.bytes_in AS bytes_in,
               hs.bytes_out AS bytes_out,
               hs.packets AS packets,
               (SELECT COUNT(*) FROM alerts a WHERE a.window_id = fw.window_id) AS alert_count
        FROM host_stats hs
        INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
        WHERE fw.device_id = ${deviceId}
          AND hs.host_key = ${hostKey}
          AND fw.start_at >= ${window.start.toISOString()}::timestamptz
          AND fw.start_at < ${window.end.toISOString()}::timestamptz
        ORDER BY fw.start_at ASC
        LIMIT ${HOST_WINDOWS_LIMIT}`
  );

  if (rows.length === 0) return empty;

  const series: HostDetailPoint[] = [];
  let bytesIn = 0;
  let bytesOut = 0;
  let packets = 0;
  let alertsCount = 0;
  let ip: string | null = null;
  let country: string | null = null;
  let riskScore: number | null = null;

  for (const row of rows) {
    const inBytes = bigintToNumber(row.bytes_in);
    const outBytes = bigintToNumber(row.bytes_out);
    const rowPackets = bigintToNumber(row.packets);
    const rowAlerts = bigintToNumber(row.alert_count);
    const timestamp = isoOrNull(row.start_at);

    bytesIn += inBytes;
    bytesOut += outBytes;
    packets += rowPackets;
    alertsCount += rowAlerts;
    // La fila más reciente gana: es el país/score vigente del host.
    if (row.ip) ip = row.ip;
    if (row.country) country = row.country;
    const rowRisk = parseRiskScore(row.risk_score);
    if (rowRisk !== null) riskScore = rowRisk;

    if (timestamp) {
      series.push({
        timestamp,
        bytes_in: inBytes,
        bytes_out: outBytes,
        packets: rowPackets,
        alert_count: rowAlerts,
      });
    }
  }

  return {
    range,
    host_key: hostKey,
    ip,
    country,
    risk_score: riskScore,
    period: { start: window.start.toISOString(), end: window.end.toISOString() },
    totals: {
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      packets,
      windows_count: rows.length,
      alerts_count: alertsCount,
    },
    series,
  };
}
