// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Política de retención (spec §12.1 / runbook docs/runbooks/database-cleanup.md).
 *
 * - flow_windows: 7 días
 * - host_stats:   7 días
 * - alerts:       30 días (se atan a flow_windows.start_at — alerts no tiene timestamp propio)
 * - agent_health: 7 días
 * - ingest_batches: 2 días (solo idempotencia) — se borra solo si NO tiene flow_windows vivo
 *
 * `devices` y `settings` NUNCA se tocan (runbook: prohibido TRUNCATE sobre ellos).
 * Las ventanas referenciadas por alertas vivas se conservan aunque superen los 7 días.
 */

export const RETENTION_DAYS = {
  flowWindows: 7,
  hostStats: 7,
  alerts: 30,
  agentHealth: 7,
  ingestBatches: 2,
} as const;

export type RetentionTable = keyof typeof RETENTION_DAYS;

export function retentionCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export interface CleanupReport {
  ok: true;
  deleted: Record<RetentionTable, number>;
  keptWindowsDueToAlerts: number;
  durationMs: number;
  cutoffs: Record<RetentionTable, string>;
  /** Tamaño total de la DB (pg_database_size); superar 400 MB dispara alerta (spec §12.4). */
  databaseBytes: number | null;
}

/**
 * Borrado secuencial e idempotente. No usa transacción interactiva (el driver
 * neon-http no la soporta en una ronda); si una sentencia falla, reintentar es seguro.
 * Orden: tablas hoja primero (alerts, host_stats) → flow_windows → agent_health → ingest_batches.
 */
export async function runRetentionCleanup(now: Date = new Date()): Promise<CleanupReport> {
  const started = Date.now();

  const cutoffs = {
    flowWindows: retentionCutoff(RETENTION_DAYS.flowWindows, now),
    hostStats: retentionCutoff(RETENTION_DAYS.hostStats, now),
    alerts: retentionCutoff(RETENTION_DAYS.alerts, now),
    agentHealth: retentionCutoff(RETENTION_DAYS.agentHealth, now),
    ingestBatches: retentionCutoff(RETENTION_DAYS.ingestBatches, now),
  };

  // 1. Alertas colgadas de ventanas más viejas que 30 días.
  const alertsResult = await db.execute(sql`
    DELETE FROM alerts
    USING flow_windows
    WHERE alerts.window_id = flow_windows.window_id
      AND flow_windows.start_at < ${cutoffs.alerts}
    RETURNING alerts.id
  `);

  // 2. Host stats de ventanas más viejas que 7 días.
  const hostStatsResult = await db.execute(sql`
    DELETE FROM host_stats
    USING flow_windows
    WHERE host_stats.window_id = flow_windows.window_id
      AND flow_windows.start_at < ${cutoffs.hostStats}
    RETURNING host_stats.id
  `);

  // 3. Ventanas viejas sin alertas vivas. Las que aún tengan alertas se conservan.
  const flowResult = await db.execute(sql`
    DELETE FROM flow_windows AS fw
    WHERE fw.start_at < ${cutoffs.flowWindows}
      AND NOT EXISTS (
        SELECT 1 FROM alerts AS a WHERE a.window_id = fw.window_id
      )
    RETURNING fw.id
  `);

  const keptResult = await db.execute<{ kept: number | string }>(sql`
    SELECT count(*) AS kept FROM flow_windows AS fw
    WHERE fw.start_at < ${cutoffs.flowWindows}
      AND EXISTS (
        SELECT 1 FROM alerts AS a WHERE a.window_id = fw.window_id
      )
  `);

  // 4. Health snapshots más viejos que 7 días.
  const healthResult = await db.execute(sql`
    DELETE FROM agent_health
    WHERE recorded_at < ${cutoffs.agentHealth}
    RETURNING id
  `);

  // 5. Batches viejos sin ventanas referenciándolos (FK flow_windows.batch_id).
  const batchesResult = await db.execute(sql`
    DELETE FROM ingest_batches AS ib
    WHERE ib.received_at < ${cutoffs.ingestBatches}
      AND NOT EXISTS (
        SELECT 1 FROM flow_windows AS fw WHERE fw.batch_id = ib.id
      )
    RETURNING ib.id
  `);

  // 6. Tamaño total de la DB para el umbral de 400 MB (spec §12.4). No crítico si falla.
  let databaseBytes: number | null = null;
  try {
    const sizeResult = await db.execute<{ bytes: number | string }>(sql`
      SELECT pg_database_size(current_database()) AS bytes
    `);
    databaseBytes = Number(sizeResult.rows[0]?.bytes ?? 0);
  } catch {
    databaseBytes = null;
  }

  return {
    ok: true,
    deleted: {
      flowWindows: flowResult.rows.length,
      hostStats: hostStatsResult.rows.length,
      alerts: alertsResult.rows.length,
      agentHealth: healthResult.rows.length,
      ingestBatches: batchesResult.rows.length,
    },
    keptWindowsDueToAlerts: Number(keptResult.rows[0]?.kept ?? 0),
    durationMs: Date.now() - started,
    cutoffs: Object.fromEntries(
      Object.entries(cutoffs).map(([key, date]) => [key, date.toISOString()])
    ) as Record<RetentionTable, string>,
    databaseBytes,
  };
}
