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
  };
  series: Array<{ timestamp: string; bytes_in: number; bytes_out: number }>;
  top_hosts: Array<{
    host_key: string;
    country: string | null;
    bytes_total: number;
    packets: number;
  }>;
  top_countries: Array<{ country: string; bytes_total: number; hosts_count: number }>;
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
}

interface SeriesRow {
  bucket: Date | string;
  bytes_in: number | string | null;
  bytes_out: number | string | null;
}

interface TopHostRow {
  host_key: string;
  country: string | null;
  bytes_in: number | string | null;
  bytes_out: number | string | null;
  packets: number | string | null;
}

interface TopCountryRow {
  country: string;
  bytes_total: number | string | null;
  hosts_count: number | string | null;
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
    },
    series: [],
    top_hosts: [],
    top_countries: [],
  };
}

/**
 * Totales single-device v1 derivados de host_stats (top hosts observados).
 * El agente no emite contadores globales de ventana; no hay migración de schema en esta tarea.
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

  const [windowCountRows, hostTotalsRows, seriesRows, topHostRows, topCountryRows, alertCountRows] =
    await Promise.all([
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
                   COALESCE(SUM(hs.packets), 0)::bigint AS packets
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
                   COALESCE((array_agg(hs.country ORDER BY fw.start_at DESC) FILTER (WHERE hs.country IS NOT NULL))[1], NULL) AS country,
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
            LIMIT 5`
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
            LIMIT 5`
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
    ]);

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
        country: row.country,
        bytes_total: bytesIn + bytesOut,
        packets: bigintToNumber(row.packets),
      };
    }),
    top_countries: topCountryRows.map((row) => ({
      country: row.country,
      bytes_total: bigintToNumber(row.bytes_total),
      hosts_count: bigintToNumber(row.hosts_count),
    })),
  };
}
