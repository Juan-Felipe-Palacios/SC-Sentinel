// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Read model `ot_topology` (M6 OT, E8.1): nodos de `ot_assets` activos y
// aristas **solo** a partir de pares cliente/servidor que aparecen en alertas
// OT (`alerts.evidence.client/server`). No se inventa ningún enlace: si no hay
// par en las alertas, la card muestra nodos y el aviso "sin aristas observadas".

import { sql } from 'drizzle-orm';
import { getRangeBounds, type RangeBounds } from './range';
import { defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';

export const OT_TOPOLOGY_NODE_CAP = 40;
export const OT_TOPOLOGY_EDGE_CAP = 80;
export const OT_TOPOLOGY_ACTIVE_DAYS = 30;

export interface OtTopologyNode {
  host_key: string;
  label: string | null;
  role: string;
  protocols: string[];
  last_seen: string;
}

export interface OtTopologyEdge {
  client: string;
  server: string;
  rule_id: string;
  count: number;
}

export interface OtTopologyResult {
  range: QueryRange;
  period: { start: string; end: string };
  nodes: OtTopologyNode[];
  edges: OtTopologyEdge[];
  truncated: { nodes: boolean; edges: boolean };
}

interface OtAssetRow {
  host_key: string;
  role: string;
  protocols: unknown;
  label: string | null;
  last_seen: Date | string;
}

interface AlertEvidenceRow {
  rule_id: string;
  evidence: Record<string, unknown> | string | null;
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mapNode(row: OtAssetRow): OtTopologyNode {
  return {
    host_key: row.host_key,
    label: row.label ?? null,
    role: row.role,
    protocols: toArray(row.protocols),
    last_seen: isoOrNull(row.last_seen) ?? String(row.last_seen),
  };
}

/**
 * Deriva aristas a partir de los pares client/server de alertas OT. Sólo se
 * conservan los pares cuyos dos extremos estén en el conjunto de nodos activos;
 * se deduplican por (client, server) acumulando el conteo.
 */
export function deriveOtEdges(
  nodeKeys: Set<string>,
  evidences: Array<{ rule_id: string; client?: unknown; server?: unknown }>
): OtTopologyEdge[] {
  const map = new Map<string, OtTopologyEdge>();
  for (const e of evidences) {
    const client = typeof e.client === 'string' ? e.client : null;
    const server = typeof e.server === 'string' ? e.server : null;
    if (!client || !server || client === server) continue;
    if (!nodeKeys.has(client) || !nodeKeys.has(server)) continue;
    const key = `${client}|${server}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.rule_id) existing.rule_id = e.rule_id;
    } else {
      map.set(key, { client, server, rule_id: e.rule_id, count: 1 });
    }
  }
  return [...map.values()];
}

function emptyTopology(range: QueryRange, bounds: RangeBounds): OtTopologyResult {
  return {
    range,
    period: { start: bounds.start.toISOString(), end: bounds.end.toISOString() },
    nodes: [],
    edges: [],
    truncated: { nodes: false, edges: false },
  };
}

export async function queryOtTopology(
  range: QueryRange = '24h',
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date(),
  bounds?: RangeBounds
): Promise<OtTopologyResult> {
  if (!deviceId) {
    const b = bounds ?? getRangeBounds(range, now);
    return emptyTopology(range, b);
  }

  const { start, end } = bounds ?? getRangeBounds(range, now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const cutoff = new Date(now.getTime() - OT_TOPOLOGY_ACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [nodeRows, alertRows] = await Promise.all([
    queryRows<OtAssetRow>(
      database,
      sql`SELECT host_key, role, protocols, label, last_seen
          FROM ot_assets
          WHERE device_id = ${deviceId}
            AND last_seen >= ${cutoff}::timestamptz
          ORDER BY last_seen DESC, host_key ASC
          LIMIT ${OT_TOPOLOGY_NODE_CAP + 1}`
    ),
    queryRows<AlertEvidenceRow>(
      database,
      sql`SELECT a.rule_id, a.evidence
          FROM alerts a
          INNER JOIN flow_windows fw ON fw.window_id = a.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
            AND a.rule_id LIKE 'ot_%'`
    ),
  ]);

  const truncatedNodes = nodeRows.length > OT_TOPOLOGY_NODE_CAP;
  const nodes = nodeRows.slice(0, OT_TOPOLOGY_NODE_CAP).map(mapNode);
  const nodeKeys = new Set(nodes.map((n) => n.host_key));

  const evidences = alertRows.map((r) => {
    const ev = parseJsonObject(r.evidence);
    return { rule_id: r.rule_id, client: ev?.client, server: ev?.server };
  });

  let edges = deriveOtEdges(nodeKeys, evidences);
  const truncatedEdges = edges.length > OT_TOPOLOGY_EDGE_CAP;
  edges = edges.slice(0, OT_TOPOLOGY_EDGE_CAP);

  return {
    range,
    period: { start: startIso, end: endIso },
    nodes,
    edges,
    truncated: { nodes: truncatedNodes, edges: truncatedEdges },
  };
}
