// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Facts agregados para el modelo (§11.1): NUNCA paquetes crudos, contenido ni IPs sin anonimizar.

import { sql } from 'drizzle-orm';
import {
  bigintToNumber,
  defaultQueryDb,
  isoOrNull,
  queryRows,
  type QueryDb,
} from '@/lib/query/db-rows';

export interface AiFacts {
  period: { start: string; end: string };
  total_bytes: number;
  total_packets: number;
  top_hosts: Array<{
    host_key: string;
    country: string | null;
    bytes: number;
    packets: number;
  }>;
  top_ports: Array<{ port: number; protocol: string; bytes: number; connections: number }>;
  top_countries: Array<{ country: string; bytes: number; hosts: number }>;
  alerts: Array<{ rule_id: string; severity: string; title: string }>;
  health: {
    capture_status: string | null;
    packets_seen: number;
    packets_dropped: number;
    parse_errors: number;
    spool_bytes: number | null;
  } | null;
}

interface LatestWindowRow {
  window_id: string;
  start_at: Date | string;
  end_at: Date | string;
  snapshot_json: unknown;
}

interface HostAggRow {
  bytes_in: number | string | null;
  bytes_out: number | string | null;
  packets: number | string | null;
}

interface AlertRow {
  rule_id: string;
  severity: string;
  title: string;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

/** Recorta/normaliza el snapshot_json al subconjunto de §11.1 que ve el modelo. */
function normalizeSnapshot(raw: unknown): Pick<
  AiFacts,
  'top_hosts' | 'top_ports' | 'top_countries' | 'health'
> {
  const snap = (raw ?? {}) as {
    top_hosts?: Array<Record<string, unknown>>;
    top_ports?: Array<Record<string, unknown>>;
    top_countries?: Array<Record<string, unknown>>;
    health?: Record<string, unknown> | null;
  };

  const topHosts = Array.isArray(snap.top_hosts) ? snap.top_hosts : [];
  const topPorts = Array.isArray(snap.top_ports) ? snap.top_ports : [];
  const topCountries = Array.isArray(snap.top_countries) ? snap.top_countries : [];
  const health = snap.health ?? null;

  return {
    top_hosts: topHosts.slice(0, 10).map((h) => ({
      host_key: asString(h['host_key']),
      country: h['country'] == null ? null : asString(h['country']),
      bytes: asNumber(h['bytes_in']) + asNumber(h['bytes_out']),
      packets: asNumber(h['packets']),
    })),
    top_ports: topPorts.slice(0, 10).map((p) => ({
      port: asNumber(p['port']),
      protocol: asString(p['protocol']),
      bytes: asNumber(p['bytes']),
      connections: asNumber(p['connections']),
    })),
    top_countries: topCountries.slice(0, 10).map((c) => ({
      country: asString(c['country']),
      bytes: asNumber(c['bytes']),
      hosts: asNumber(c['hosts']),
    })),
    health: health
      ? {
          capture_status:
            typeof health['capture_status'] === 'string' ? health['capture_status'] : null,
          packets_seen: asNumber(health['packets_seen']),
          packets_dropped: asNumber(health['packets_dropped']),
          parse_errors: asNumber(health['parse_errors']),
          spool_bytes:
            health['spool_bytes'] == null ? null : asNumber(health['spool_bytes']),
        }
      : null,
  };
}

/**
 * Recupera los facts agregados de la última ventana con datos para el device.
 * Devuelve null cuando no hay ninguna ventana (el pipeline responde no_data).
 */
export async function fetchAiFacts(
  deviceId: string,
  database: QueryDb = defaultQueryDb
): Promise<AiFacts | null> {
  if (!deviceId) return null;

  const windowRows = await queryRows<LatestWindowRow>(
    database,
    sql`SELECT fw.window_id, fw.start_at, fw.end_at, fw.snapshot_json
        FROM flow_windows fw
        WHERE fw.device_id = ${deviceId}
        ORDER BY fw.start_at DESC
        LIMIT 1`
  );
  const latest = windowRows[0];
  if (!latest) return null;

  const [hostAggRows, alertRows] = await Promise.all([
    queryRows<HostAggRow>(
      database,
      sql`SELECT COALESCE(SUM(hs.bytes_in), 0)::bigint AS bytes_in,
                 COALESCE(SUM(hs.bytes_out), 0)::bigint AS bytes_out,
                 COALESCE(SUM(hs.packets), 0)::bigint AS packets
          FROM host_stats hs
          WHERE hs.window_id = ${latest.window_id}`
    ),
    // Alerta agregada: solo lo esencial; la evidencia permanece en la tabla.
    queryRows<AlertRow>(
      database,
      sql`SELECT a.rule_id, a.severity, a.title
          FROM alerts a
          WHERE a.window_id = ${latest.window_id}
          ORDER BY a.id
          LIMIT 10`
    ),
  ]);

  const hostAgg = hostAggRows[0];
  const totalBytesIn = bigintToNumber(hostAgg?.bytes_in);
  const totalBytesOut = bigintToNumber(hostAgg?.bytes_out);
  const totalPackets = bigintToNumber(hostAgg?.packets);

  const snap = normalizeSnapshot(latest.snapshot_json);

  return {
    period: {
      start: isoOrNull(latest.start_at) ?? new Date(latest.start_at).toISOString(),
      end: isoOrNull(latest.end_at) ?? new Date(latest.end_at).toISOString(),
    },
    total_bytes: totalBytesIn + totalBytesOut,
    total_packets: totalPackets,
    top_hosts: snap.top_hosts,
    top_ports: snap.top_ports,
    top_countries: snap.top_countries,
    alerts: alertRows.map((a) => ({ rule_id: a.rule_id, severity: a.severity, title: a.title })),
    health: snap.health,
  };
}
