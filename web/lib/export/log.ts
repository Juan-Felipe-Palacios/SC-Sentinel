// web/lib/export/log.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Log de exportaciones best-effort: un fallo aquí nunca rompe la descarga.
import { randomUUID } from 'node:crypto';
import { db, exportLogs } from '@/lib/db';

export interface ExportLogInput {
  role: 'admin' | 'guest';
  deviceId: string | null;
  metric: string;
  range: string;
  format: 'csv' | 'xlsx';
  rowCount: number;
  bytes: number;
}

export async function logExport(input: ExportLogInput): Promise<void> {
  try {
    await db.insert(exportLogs).values({
      id: `exp_${randomUUID()}`,
      role: input.role,
      deviceId: input.deviceId,
      metric: input.metric,
      range: input.range,
      format: input.format,
      rowCount: input.rowCount,
      bytes: input.bytes,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'export_log_failed', error: error instanceof Error ? error.name : 'unknown' }));
  }
}
