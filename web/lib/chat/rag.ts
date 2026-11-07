// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Recuperación RAG del chatbot: métricas, hosts y alertas de las últimas 24 h
// de UN device autorizado. El device_id nunca sale del body de la petición.

import { sql } from 'drizzle-orm';
import {
  bigintToNumber,
  defaultQueryDb,
  isoOrNull,
  queryRows,
  type QueryDb,
} from '@/lib/query/db-rows';
import {
  CHAT_CONTEXT_HOURS,
  type ChatContext,
  type ChatHealth,
  type ChatTopCountry,
  type ChatTopPort,
} from './types';

interface TotalsRow {
  bytes_in: number | string | null;
  bytes_out: number | string | null;
  packets: number | string | null;
  windows_count: number | string | null;
}

interface AlertsCountRow {
  alerts_count: number | string | null;
}

interface HostRow {
  host_key: string;
  ip: string | null;
  country: string | null;
  bytes: number | string | null;
  packets: number | string | null;
}

interface AlertRow {
  id: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string;
  created_at: Date | string | null;
}

interface HealthRow {
  capture_status: string;
  packets_seen: number | string | null;
  packets_dropped: number | string | null;
  parse_errors: number | string | null;
  queue_depth: number | string | null;
  spool_bytes: number | string | null;
  recorded_at: Date | string | null;
}

interface SnapshotRow {
  snapshot_json: unknown;
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

/** Última ventana del período: puertos y países no se agregan en host_stats. */
function normalizeSnapshot(raw: unknown): {
  topPorts: ChatTopPort[];
  topCountries: ChatTopCountry[];
} {
  const snap = (raw ?? {}) as {
    top_ports?: unknown;
    top_countries?: unknown;
  };

  const ports = Array.isArray(snap.top_ports) ? snap.top_ports : [];
  const countries = Array.isArray(snap.top_countries) ? snap.top_countries : [];

  return {
    topPorts: ports.slice(0, 10).map((value) => {
      const row = (value ?? {}) as Record<string, unknown>;
      return {
        port: asNumber(row['port']),
        protocol: asString(row['protocol']),
        bytes: asNumber(row['bytes']),
        connections: asNumber(row['connections']),
      };
    }),
    topCountries: countries.slice(0, 10).map((value) => {
      const row = (value ?? {}) as Record<string, unknown>;
      return {
        country: asString(row['country']),
        bytes: asNumber(row['bytes']),
        hosts: asNumber(row['hosts']),
      };
    }),
  };
}

function mapHealth(row: HealthRow | undefined): ChatHealth | null {
  if (!row) return null;
  return {
    captureStatus: row.capture_status,
    packetsSeen: bigintToNumber(row.packets_seen),
    packetsDropped: bigintToNumber(row.packets_dropped),
    parseErrors: bigintToNumber(row.parse_errors),
    queueDepth: row.queue_depth == null ? null : bigintToNumber(row.queue_depth),
    spoolBytes: row.spool_bytes == null ? null : bigintToNumber(row.spool_bytes),
    recordedAt: isoOrNull(row.recorded_at),
  };
}

/**
 * Contexto RAG acotado al device y a las últimas 24 h. Las consultas que unen
 * `host_stats`/`alerts` con `flow_windows` filtran siempre por `fw.device_id`.
 */
export async function fetchChatContext(
  deviceId: string,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date()
): Promise<ChatContext> {
  if (!deviceId) {
    throw new Error('fetchChatContext requiere deviceId');
  }

  const end = now;
  const start = new Date(end.getTime() - CHAT_CONTEXT_HOURS * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [totalsRows, alertsCountRows, hostRows, alertRows, healthRows, snapshotRows] =
    await Promise.all([
      queryRows<TotalsRow>(
        database,
        sql`SELECT COALESCE(SUM(hs.bytes_in), 0)::bigint AS bytes_in,
                   COALESCE(SUM(hs.bytes_out), 0)::bigint AS bytes_out,
                   COALESCE(SUM(hs.packets), 0)::bigint AS packets,
                   COUNT(DISTINCT fw.id)::bigint AS windows_count
            FROM flow_windows fw
            LEFT JOIN host_stats hs ON hs.window_id = fw.window_id
            WHERE fw.device_id = ${deviceId}
              AND fw.start_at >= ${startIso}::timestamptz
              AND fw.start_at < ${endIso}::timestamptz`
      ),
      queryRows<AlertsCountRow>(
        database,
        sql`SELECT COUNT(*)::bigint AS alerts_count
            FROM alerts a
            INNER JOIN flow_windows fw ON fw.window_id = a.window_id
            WHERE fw.device_id = ${deviceId}
              AND fw.start_at >= ${startIso}::timestamptz
              AND fw.start_at < ${endIso}::timestamptz`
      ),
      queryRows<HostRow>(
        database,
        sql`SELECT hs.host_key,
                   (array_agg(hs.ip_display ORDER BY fw.start_at DESC)
                     FILTER (WHERE hs.ip_display IS NOT NULL))[1] AS ip,
                   (array_agg(hs.country ORDER BY fw.start_at DESC)
                     FILTER (WHERE hs.country IS NOT NULL))[1] AS country,
                   COALESCE(SUM(hs.bytes_in + hs.bytes_out), 0)::bigint AS bytes,
                   COALESCE(SUM(hs.packets), 0)::bigint AS packets
            FROM host_stats hs
            INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
            WHERE fw.device_id = ${deviceId}
              AND fw.start_at >= ${startIso}::timestamptz
              AND fw.start_at < ${endIso}::timestamptz
            GROUP BY hs.host_key
            ORDER BY SUM(hs.bytes_in + hs.bytes_out) DESC
            LIMIT 10`
      ),
      queryRows<AlertRow>(
        database,
        sql`SELECT a.id,
                   a.rule_id,
                   a.severity,
                   a.title,
                   a.description,
                   fw.start_at AS created_at
            FROM alerts a
            INNER JOIN flow_windows fw ON fw.window_id = a.window_id
            WHERE fw.device_id = ${deviceId}
              AND fw.start_at >= ${startIso}::timestamptz
              AND fw.start_at < ${endIso}::timestamptz
            ORDER BY fw.start_at DESC
            LIMIT 10`
      ),
      queryRows<HealthRow>(
        database,
        sql`SELECT capture_status,
                   packets_seen,
                   packets_dropped,
                   parse_errors,
                   queue_depth,
                   spool_bytes,
                   recorded_at
            FROM agent_health
            WHERE device_id = ${deviceId}
            ORDER BY recorded_at DESC
            LIMIT 1`
      ),
      queryRows<SnapshotRow>(
        database,
        sql`SELECT snapshot_json
            FROM flow_windows
            WHERE device_id = ${deviceId}
              AND start_at >= ${startIso}::timestamptz
              AND start_at < ${endIso}::timestamptz
            ORDER BY start_at DESC
            LIMIT 1`
      ),
    ]);

  const totals = totalsRows[0];
  const snapshot = normalizeSnapshot(snapshotRows[0]?.snapshot_json);

  return {
    period: { start: startIso, end: endIso },
    totals: {
      bytes:
        bigintToNumber(totals?.bytes_in) + bigintToNumber(totals?.bytes_out),
      packets: bigintToNumber(totals?.packets),
      windows: bigintToNumber(totals?.windows_count),
      alerts: bigintToNumber(alertsCountRows[0]?.alerts_count),
    },
    topHosts: hostRows.map((row) => ({
      hostKey: row.host_key,
      ip: row.ip ?? null,
      country: row.country ?? null,
      bytes: bigintToNumber(row.bytes),
      packets: bigintToNumber(row.packets),
    })),
    topPorts: snapshot.topPorts,
    topCountries: snapshot.topCountries,
    alerts: alertRows.map((row) => ({
      id: row.id,
      ruleId: row.rule_id,
      severity: row.severity,
      title: row.title,
      description: row.description,
      createdAt: isoOrNull(row.created_at),
    })),
    health: mapHealth(healthRows[0]),
  };
}
