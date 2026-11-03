// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { getRangeBounds } from './range';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';

export const HOSTS_LIMIT = 50;

export interface HostMetricItem {
  host_key: string;
  country: string | null;
  bytes_in: number;
  bytes_out: number;
  packets: number;
  risk_score: number | null;
  first_seen: string | null;
  last_seen: string | null;
}

export interface HostsResult {
  range: QueryRange;
  hosts: HostMetricItem[];
  total: number;
}

interface HostRow {
  host_key: string;
  country: string | null;
  bytes_in: number | string | null;
  bytes_out: number | string | null;
  packets: number | string | null;
  risk_score: string | null;
  first_seen: Date | string | null;
  last_seen: Date | string | null;
}

interface TotalRow {
  total: number | string | null;
}

function emptyHosts(range: QueryRange): HostsResult {
  return { range, hosts: [], total: 0 };
}

function parseRiskScore(value: string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function queryHosts(
  range: QueryRange = '1h',
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date()
): Promise<HostsResult> {
  if (!deviceId) return emptyHosts(range);

  const { start, end } = getRangeBounds(range, now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [rows, totalRows] = await Promise.all([
    queryRows<HostRow>(
      database,
      sql`SELECT hs.host_key,
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
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
          GROUP BY hs.host_key
          ORDER BY SUM(hs.bytes_in + hs.bytes_out) DESC
          LIMIT ${HOSTS_LIMIT}`
    ),
    queryRows<TotalRow>(
      database,
      sql`SELECT COUNT(DISTINCT hs.host_key)::bigint AS total
          FROM host_stats hs
          INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz`
    ),
  ]);

  return {
    range,
    hosts: rows.map((row) => ({
      host_key: row.host_key,
      country: row.country,
      bytes_in: bigintToNumber(row.bytes_in),
      bytes_out: bigintToNumber(row.bytes_out),
      packets: bigintToNumber(row.packets),
      risk_score: parseRiskScore(row.risk_score),
      first_seen: isoOrNull(row.first_seen),
      last_seen: isoOrNull(row.last_seen),
    })),
    total: bigintToNumber(totalRows[0]?.total),
  };
}
