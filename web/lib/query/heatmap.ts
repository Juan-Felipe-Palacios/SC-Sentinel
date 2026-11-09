// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Mapa de calor hora-del-día × puerto. Los puertos solo existen agregados por
// ventana (`snapshot_json.top_ports`), no por host: el eje es la hora UTC del
// período, no una atribución a un destino concreto.

import { sql } from 'drizzle-orm';
import { getRangeBounds, type RangeBounds } from './range';
import { bigintToNumber, defaultQueryDb, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';

/** Columnas de puerto que se muestran; el resto se descarta por legibilidad. */
export const HEATMAP_PORTS_LIMIT = 8;

export interface HeatmapPort {
  port: number;
  protocol: string;
  bytes: number;
}

export interface HeatmapResult {
  range: QueryRange;
  period: { start: string; end: string };
  /** 24 filas fijas: hora UTC del día (0–23). */
  hours: number[];
  ports: HeatmapPort[];
  /** `cells[hora][puerto]` en bytes; misma longitud que `ports`. */
  cells: number[][];
  max: number;
  total_bytes: number;
}

interface HeatmapRow {
  hour_of_day: number | string | null;
  port: number | string | null;
  protocol: string | null;
  bytes: number | string | null;
}

export function buildHeatmap(
  rows: HeatmapRow[],
  range: QueryRange,
  bounds: RangeBounds
): HeatmapResult {
  const byPort = new Map<string, HeatmapPort>();
  const matrix = new Map<string, number[]>();

  for (const row of rows) {
    const hour = Number(row.hour_of_day ?? 0);
    const port = Number(row.port ?? 0);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(port) || port <= 0) {
      continue;
    }
    const protocol = (row.protocol ?? '').toLowerCase();
    const key = `${port}/${protocol}`;
    const bytes = bigintToNumber(row.bytes);

    const existing = byPort.get(key);
    if (existing) {
      existing.bytes += bytes;
    } else {
      byPort.set(key, { port, protocol, bytes });
    }

    const column = matrix.get(key) ?? Array.from({ length: 24 }, () => 0);
    column[hour] += bytes;
    matrix.set(key, column);
  }

  const ports = Array.from(byPort.values())
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, HEATMAP_PORTS_LIMIT);

  const cells: number[][] = Array.from({ length: 24 }, () => []);
  let max = 0;
  let total = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    for (const port of ports) {
      const key = `${port.port}/${port.protocol}`;
      const value = matrix.get(key)?.[hour] ?? 0;
      cells[hour].push(value);
      if (value > max) max = value;
      total += value;
    }
  }

  return {
    range,
    period: { start: bounds.start.toISOString(), end: bounds.end.toISOString() },
    hours: Array.from({ length: 24 }, (_, i) => i),
    ports,
    cells,
    max,
    total_bytes: total,
  };
}

export async function queryPortHeatmap(
  range: QueryRange = '24h',
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date(),
  bounds?: RangeBounds
): Promise<HeatmapResult> {
  const window = bounds ?? getRangeBounds(range, now);
  if (!deviceId) return buildHeatmap([], range, window);

  const rows = await queryRows<HeatmapRow>(
    database,
    sql`SELECT EXTRACT(HOUR FROM fw.start_at AT TIME ZONE 'UTC')::int AS hour_of_day,
               (elem->>'port')::int AS port,
               COALESCE(elem->>'protocol', '') AS protocol,
               COALESCE(SUM((elem->>'bytes')::bigint), 0)::bigint AS bytes
        FROM flow_windows fw
        CROSS JOIN jsonb_array_elements(COALESCE(fw.snapshot_json->'top_ports', '[]'::jsonb)) AS elem
        WHERE fw.device_id = ${deviceId}
          AND fw.start_at >= ${window.start.toISOString()}::timestamptz
          AND fw.start_at < ${window.end.toISOString()}::timestamptz
        GROUP BY 1, 2, 3
        ORDER BY bytes DESC`
  );

  return buildHeatmap(rows, range, window);
}
