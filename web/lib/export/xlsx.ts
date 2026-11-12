// web/lib/export/xlsx.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Workbook XLSX multi-sheet desde filas tabulares. Mismos datos que el CSV.
import * as XLSX from 'xlsx';
import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertExportItem } from '@/lib/query/alerts';
import type { OverviewResult } from '@/lib/query/overview';
import type { ExportWindowItem } from '@/lib/query/export';

export type ExportRow = Record<string, string | number | null>;

export function rowsFromHosts(hosts: HostMetricItem[]): ExportRow[] {
  return hosts.map((host) => ({
    host_key: host.host_key, ip: host.ip, country: host.country,
    bytes_in: host.bytes_in, bytes_out: host.bytes_out, packets: host.packets,
    risk_score: host.risk_score, first_seen: host.first_seen, last_seen: host.last_seen,
  }));
}

export function rowsFromAlerts(alerts: AlertExportItem[]): ExportRow[] {
  return alerts.map((alert) => ({
    id: alert.id, window_id: alert.window_id, rule_id: alert.rule_id,
    severity: alert.severity, title: alert.title, created_at: alert.created_at,
  }));
}

export function rowsFromWindows(windows: ExportWindowItem[]): ExportRow[] {
  return windows.map((w) => ({
    window_id: w.window_id, start_at: w.start_at, end_at: w.end_at, sequence: w.sequence,
  }));
}

export function rowsFromOverview(overview: OverviewResult): ExportRow[] {
  const t = overview.totals;
  return [
    { metric: 'bytes_in', value: t.bytes_in },
    { metric: 'bytes_out', value: t.bytes_out },
    { metric: 'packets_in', value: t.packets_in },
    { metric: 'packets_out', value: t.packets_out },
    { metric: 'windows_count', value: t.windows_count },
    { metric: 'alerts_count', value: t.alerts_count },
    { metric: 'hosts_count', value: t.hosts_count },
    { metric: 'countries_count', value: t.countries_count },
    { metric: 'risk_avg_score', value: overview.risk.avg_score },
  ];
}

/** Construye el Buffer .xlsx con una hoja por entrada de `sheets`. */
export function buildXlsxBufferMulti(sheets: Record<string, ExportRow[]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
