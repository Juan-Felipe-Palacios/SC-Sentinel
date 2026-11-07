// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { getRangeBounds, seriesBucketSeconds } from './range';
import {
  bigintToNumber,
  defaultQueryDb,
  isoOrNull,
  queryRows,
  type QueryDb,
} from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';

export const TOP_HOSTS_LIMIT = 10;
export const TOP_PORTS_LIMIT = 10;
export const TOP_COUNTRIES_LIMIT = 5;

export interface AlertSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface OverviewTopHost {
  host_key: string;
  /** IP legible del host (null cuando el agente anonimiza). */
  ip: string | null;
  country: string | null;
  /** Último risk_score observado (0.0–1.0); null si el host no tiene score. */
  risk_score: number | null;
  bytes_in: number;
  bytes_out: number;
  bytes_total: number;
  packets: number;
}

/** Riesgo determinista agregado del período (una muestra por host: su último score). */
export interface OverviewRisk {
  /** Hosts con risk_score observado. */
  scored_hosts: number;
  high_hosts: number;
  medium_hosts: number;
  low_hosts: number;
  /** Promedio de los scores (0.0–1.0); null si ningún host tiene score. */
  avg_score: number | null;
}

export interface OverviewResult {
  range: QueryRange;
  period: { start: string; end: string };
  totals: {
    bytes_in: number;
    bytes_out: number;
    packets_in: number;
    packets_out: number;
    windows_count: number;
    alerts_count: number;
    hosts_count: number;
    countries_count: number;
    alerts_by_severity: AlertSeverityCounts;
  };
  series: Array<{ timestamp: string; bytes_in: number; bytes_out: number }>;
  top_hosts: OverviewTopHost[];
  top_countries: Array<{ country: string; bytes_total: number; hosts_count: number }>;
  top_ports: Array<{ port: number; protocol: string; bytes: number; connections: number }>;
  protocols: Array<{ protocol: string; bytes: number; connections: number }>;
  risk: OverviewRisk;
}

interface WindowCountRow {
  windows_count: number | string | null;
}

interface AlertCountRow {
  alerts_count: number | string | null;
}

interface HostTotalsRow {
  bytes_in: number | string | null;
  bytes_out: number | string | null;
  packets: number | string | null;
  hosts_count: number | string | null;
  countries_count: number | string | null;
}

interface SeriesRow {
  bucket: Date | string;
  bytes_in: number | string | null;
  bytes_out: number | string | null;
}

interface TopHostRow {
  host_key: string;
  ip: string | null;
  country: string | null;
  risk_score: string | null;
  bytes_in: number | string | null;
  bytes_out: number | string | null;
  packets: number | string | null;
}

interface TopCountryRow {
  country: string;
  bytes_total: number | string | null;
  hosts_count: number | string | null;
}

interface AlertSeverityRow {
  severity: string | null;
  count: number | string | null;
}

interface RiskRow {
  scored_hosts: number | string | null;
  high_hosts: number | string | null;
  medium_hosts: number | string | null;
  low_hosts: number | string | null;
  avg_score: number | string | null;
}

interface PortRow {
  port: number | string | null;
  protocol: string | null;
  bytes: number | string | null;
  connections: number | string | null;
}

function emptySeverityCounts(): AlertSeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

function emptyRisk(): OverviewRisk {
  return { scored_hosts: 0, high_hosts: 0, medium_hosts: 0, low_hosts: 0, avg_score: null };
}

/** risk_score llega como texto desde Neon (columna text del schema) → número o null. */
function parseRiskScore(value: string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSeverityCounts(rows: AlertSeverityRow[]): AlertSeverityCounts {
  const counts = emptySeverityCounts();
  for (const row of rows) {
    const key = (row.severity ?? '').toLowerCase() as keyof AlertSeverityCounts;
    if (key in counts) counts[key] += bigintToNumber(row.count);
  }
  return counts;
}

function emptyOverview(range: QueryRange, now: Date = new Date()): OverviewResult {
  const { start, end } = getRangeBounds(range, now);
  return {
    range,
    period: { start: start.toISOString(), end: end.toISOString() },
    totals: {
      bytes_in: 0,
      bytes_out: 0,
      packets_in: 0,
      packets_out: 0,
      windows_count: 0,
      alerts_count: 0,
      hosts_count: 0,
      countries_count: 0,
      alerts_by_severity: emptySeverityCounts(),
    },
    series: [],
    top_hosts: [],
    top_countries: [],
    top_ports: [],
    protocols: [],
    risk: emptyRisk(),
  };
}

/**
 * Totales single-device v1 derivados de host_stats (top hosts observados).
 * El agente no emite contadores globales de ventana; no hay migración de schema en esta tarea.
 * `top_ports` y `top_countries` se agregan desde el `snapshot_json` de cada ventana.
 */
export async function queryOverview(
  range: QueryRange = '1h',
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date()
): Promise<OverviewResult> {
  const { start, end } = getRangeBounds(range, now);
  const empty = emptyOverview(range, now);
  if (!deviceId) return empty;

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const bucketSeconds = seriesBucketSeconds(range);

  const [
    windowCountRows,
    hostTotalsRows,
    seriesRows,
    topHostRows,
    topCountryRows,
    alertCountRows,
    alertSeverityRows,
    portRows,
    riskRows,
  ] = await Promise.all([
    queryRows<WindowCountRow>(
      database,
      sql`SELECT COUNT(*)::bigint AS windows_count
          FROM flow_windows
          WHERE device_id = ${deviceId}
            AND start_at >= ${startIso}::timestamptz
            AND start_at < ${endIso}::timestamptz`
    ),
    queryRows<HostTotalsRow>(
      database,
      sql`SELECT COALESCE(SUM(hs.bytes_in), 0)::bigint AS bytes_in,
                 COALESCE(SUM(hs.bytes_out), 0)::bigint AS bytes_out,
                 COALESCE(SUM(hs.packets), 0)::bigint AS packets,
                 COUNT(DISTINCT hs.host_key)::bigint AS hosts_count,
                 (COUNT(DISTINCT hs.country) FILTER (
                   WHERE hs.country IS NOT NULL AND hs.country <> 'LAN'
                 ))::bigint AS countries_count
          FROM host_stats hs
          INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz`
    ),
    queryRows<SeriesRow>(
      database,
      sql`SELECT date_bin(make_interval(secs => ${bucketSeconds}), fw.start_at, '1970-01-01 00:00:00+00'::timestamptz) AS bucket,
                 COALESCE(SUM(hs.bytes_in), 0)::bigint AS bytes_in,
                 COALESCE(SUM(hs.bytes_out), 0)::bigint AS bytes_out
          FROM flow_windows fw
          LEFT JOIN host_stats hs ON hs.window_id = fw.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
          GROUP BY bucket
          ORDER BY bucket ASC`
    ),
    queryRows<TopHostRow>(
      database,
      sql`SELECT hs.host_key,
                 COALESCE((array_agg(hs.ip_display ORDER BY fw.start_at DESC) FILTER (WHERE hs.ip_display IS NOT NULL))[1], NULL) AS ip,
                 COALESCE((array_agg(hs.country ORDER BY fw.start_at DESC) FILTER (WHERE hs.country IS NOT NULL))[1], NULL) AS country,
                 (array_agg(hs.risk_score ORDER BY fw.start_at DESC) FILTER (WHERE hs.risk_score IS NOT NULL))[1] AS risk_score,
                 COALESCE(SUM(hs.bytes_in), 0)::bigint AS bytes_in,
                 COALESCE(SUM(hs.bytes_out), 0)::bigint AS bytes_out,
                 COALESCE(SUM(hs.packets), 0)::bigint AS packets
          FROM host_stats hs
          INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
          GROUP BY hs.host_key
          ORDER BY SUM(hs.bytes_in + hs.bytes_out) DESC
          LIMIT ${TOP_HOSTS_LIMIT}`
    ),
    queryRows<TopCountryRow>(
      database,
      sql`SELECT elem->>'country' AS country,
                 COALESCE(SUM((elem->>'bytes')::bigint), 0)::bigint AS bytes_total,
                 COALESCE(SUM((elem->>'hosts')::bigint), 0)::bigint AS hosts_count
          FROM flow_windows fw
          CROSS JOIN jsonb_array_elements(COALESCE(fw.snapshot_json->'top_countries', '[]'::jsonb)) AS elem
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
          GROUP BY elem->>'country'
          ORDER BY bytes_total DESC
          LIMIT ${TOP_COUNTRIES_LIMIT}`
    ),
    queryRows<AlertCountRow>(
      database,
      sql`SELECT COUNT(*)::bigint AS alerts_count
          FROM alerts a
          INNER JOIN flow_windows fw ON fw.window_id = a.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz`
    ),
    queryRows<AlertSeverityRow>(
      database,
      sql`SELECT a.severity,
                 COUNT(*)::bigint AS count
          FROM alerts a
          INNER JOIN flow_windows fw ON fw.window_id = a.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
          GROUP BY a.severity`
    ),
    queryRows<PortRow>(
      database,
      sql`SELECT (elem->>'port')::int AS port,
                 elem->>'protocol' AS protocol,
                 COALESCE(SUM((elem->>'bytes')::bigint), 0)::bigint AS bytes,
                 COALESCE(SUM((elem->>'connections')::bigint), 0)::bigint AS connections
          FROM flow_windows fw
          CROSS JOIN jsonb_array_elements(COALESCE(fw.snapshot_json->'top_ports', '[]'::jsonb)) AS elem
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
          GROUP BY (elem->>'port')::int, elem->>'protocol'
          ORDER BY SUM((elem->>'bytes')::bigint) DESC`
    ),
    queryRows<RiskRow>(
      database,
      sql`WITH latest AS (
            SELECT DISTINCT ON (hs.host_key) hs.host_key, hs.risk_score
            FROM host_stats hs
            INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
            WHERE fw.device_id = ${deviceId}
              AND fw.start_at >= ${startIso}::timestamptz
              AND fw.start_at < ${endIso}::timestamptz
              AND hs.risk_score IS NOT NULL
            ORDER BY hs.host_key, fw.start_at DESC
          )
          SELECT COUNT(*)::bigint AS scored_hosts,
                 AVG(risk_score::float8) AS avg_score,
                 (COUNT(*) FILTER (WHERE risk_score::float8 >= 0.7))::bigint AS high_hosts,
                 (COUNT(*) FILTER (WHERE risk_score::float8 >= 0.4 AND risk_score::float8 < 0.7))::bigint AS medium_hosts,
                 (COUNT(*) FILTER (WHERE risk_score::float8 < 0.4))::bigint AS low_hosts
          FROM latest`
    ),
  ]);

  // La distribución por protocolo sale de las mismas filas: el ranking de puertos se
  // recorta a TOP_PORTS_LIMIT, pero el reparto por protocolo usa todos los puertos.
  const protocolsByKey = new Map<string, { bytes: number; connections: number }>();
  for (const row of portRows) {
    const key = (row.protocol ?? 'other').toLowerCase();
    const current = protocolsByKey.get(key) ?? { bytes: 0, connections: 0 };
    current.bytes += bigintToNumber(row.bytes);
    current.connections += bigintToNumber(row.connections);
    protocolsByKey.set(key, current);
  }

  const hostTotals = hostTotalsRows[0];
  const totalBytesIn = bigintToNumber(hostTotals?.bytes_in);
  const totalBytesOut = bigintToNumber(hostTotals?.bytes_out);
  const totalPackets = bigintToNumber(hostTotals?.packets);

  return {
    range,
    period: { start: start.toISOString(), end: end.toISOString() },
    totals: {
      bytes_in: totalBytesIn,
      bytes_out: totalBytesOut,
      // El snapshot no separa packets_in/packets_out; se expone el agregado en ambos campos.
      packets_in: totalPackets,
      packets_out: totalPackets,
      windows_count: bigintToNumber(windowCountRows[0]?.windows_count),
      alerts_count: bigintToNumber(alertCountRows[0]?.alerts_count),
      hosts_count: bigintToNumber(hostTotals?.hosts_count),
      countries_count: bigintToNumber(hostTotals?.countries_count),
      alerts_by_severity: toSeverityCounts(alertSeverityRows),
    },
    series: seriesRows.map((row) => ({
      timestamp: isoOrNull(row.bucket) ?? new Date(row.bucket).toISOString(),
      bytes_in: bigintToNumber(row.bytes_in),
      bytes_out: bigintToNumber(row.bytes_out),
    })),
    top_hosts: topHostRows.map((row) => {
      const bytesIn = bigintToNumber(row.bytes_in);
      const bytesOut = bigintToNumber(row.bytes_out);
      return {
        host_key: row.host_key,
        ip: row.ip ?? null,
        country: row.country,
        risk_score: parseRiskScore(row.risk_score),
        bytes_in: bytesIn,
        bytes_out: bytesOut,
        bytes_total: bytesIn + bytesOut,
        packets: bigintToNumber(row.packets),
      };
    }),
    top_countries: topCountryRows.map((row) => ({
      country: row.country,
      bytes_total: bigintToNumber(row.bytes_total),
      hosts_count: bigintToNumber(row.hosts_count),
    })),
    top_ports: portRows
      .filter((row) => row.port !== null)
      .slice(0, TOP_PORTS_LIMIT)
      .map((row) => ({
        port: Number(row.port),
        protocol: (row.protocol ?? 'other').toLowerCase(),
        bytes: bigintToNumber(row.bytes),
        connections: bigintToNumber(row.connections),
      })),
    protocols: Array.from(protocolsByKey, ([protocol, value]) => ({
      protocol,
      bytes: value.bytes,
      connections: value.connections,
    })).sort((a, b) => b.bytes - a.bytes),
    risk: toRisk(riskRows[0]),
  };
}

function toRisk(row: RiskRow | undefined): OverviewRisk {
  if (!row) return emptyRisk();
  const avg = row.avg_score === null || row.avg_score === undefined ? null : Number(row.avg_score);
  return {
    scored_hosts: bigintToNumber(row.scored_hosts),
    high_hosts: bigintToNumber(row.high_hosts),
    medium_hosts: bigintToNumber(row.medium_hosts),
    low_hosts: bigintToNumber(row.low_hosts),
    avg_score: avg !== null && Number.isFinite(avg) ? avg : null,
  };
}
