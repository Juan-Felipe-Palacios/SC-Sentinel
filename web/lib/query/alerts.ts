// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { getRangeBounds } from './range';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';

export const ALERTS_LIMIT = 100;

export interface AlertItem {
  id: string;
  window_id: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string | null;
}

export interface AlertsResult {
  range: QueryRange;
  alerts: AlertItem[];
  total: number;
}

interface AlertRow {
  id: string;
  window_id: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string | null;
  evidence: Record<string, unknown> | string | null;
  created_at: Date | string | null;
}

interface TotalRow {
  total: number | string | null;
}

function emptyAlerts(range: QueryRange): AlertsResult {
  return { range, alerts: [], total: 0 };
}

function parseEvidence(value: AlertRow['evidence']): Record<string, unknown> | null {
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
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * alerts no tiene created_at en el schema actual; se expone flow_windows.start_at como timestamp de creación.
 */
export async function queryAlerts(
  range: QueryRange = '24h',
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date(),
  severity?: string | null
): Promise<AlertsResult> {
  if (!deviceId) return emptyAlerts(range);

  const { start, end } = getRangeBounds(range, now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const severityFilter = severity ? sql` AND a.severity = ${severity}` : sql``;

  const [rows, totalRows] = await Promise.all([
    queryRows<AlertRow>(
      database,
      sql`SELECT a.id,
                 a.window_id,
                 a.rule_id,
                 a.severity,
                 a.title,
                 a.description,
                 a.evidence,
                 fw.start_at AS created_at
          FROM alerts a
          INNER JOIN flow_windows fw ON fw.window_id = a.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
            ${severityFilter}
          ORDER BY fw.start_at DESC
          LIMIT ${ALERTS_LIMIT}`
    ),
    queryRows<TotalRow>(
      database,
      sql`SELECT COUNT(*)::bigint AS total
          FROM alerts a
          INNER JOIN flow_windows fw ON fw.window_id = a.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
            ${severityFilter}`
    ),
  ]);

  return {
    range,
    alerts: rows.map((row) => ({
      id: row.id,
      window_id: row.window_id,
      rule_id: row.rule_id,
      severity: row.severity,
      title: row.title,
      description: row.description,
      evidence: parseEvidence(row.evidence),
      created_at: isoOrNull(row.created_at),
    })),
    total: bigintToNumber(totalRows[0]?.total),
  };
}
