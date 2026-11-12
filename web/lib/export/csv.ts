// web/lib/export/csv.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Constructores puros de CSV (sin DB ni Next). Sanitización anti-injection
// (OWASP CSV Injection): celdas que empiezan con =, +, -, @ se anteponen
// con comilla simple para que Excel las trate como texto.

import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertExportItem } from '@/lib/query/alerts';
import type { OverviewResult } from '@/lib/query/overview';

/** Antepone ' si el valor (tras espacios) empieza con =, +, -, @. */
export function sanitizeCsvFormula(value: string): string {
  const trimmed = value.replace(/^\s+/, '');
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : sanitizeCsvFormula(String(value));
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function row(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(',');
}

const HOSTS_HEADER = 'host_key,ip,country,bytes_in,bytes_out,packets,risk_score,first_seen,last_seen';
const ALERTS_HEADER = 'id,window_id,rule_id,severity,title,created_at';

export function hostsToCsv(hosts: HostMetricItem[]): string {
  const lines = [HOSTS_HEADER];
  for (const host of hosts) {
    lines.push(row([host.host_key, host.ip, host.country, host.bytes_in, host.bytes_out, host.packets, host.risk_score, host.first_seen, host.last_seen]));
  }
  return `${lines.join('\n')}\n`;
}

export function alertsToCsv(alerts: AlertExportItem[]): string {
  const lines = [ALERTS_HEADER];
  for (const alert of alerts) {
    lines.push(row([alert.id, alert.window_id, alert.rule_id, alert.severity, alert.title, alert.created_at]));
  }
  return `${lines.join('\n')}\n`;
}

export function overviewToCsv(overview: OverviewResult): string {
  const t = overview.totals;
  const lines = [
    'metric,value',
    row(['range', overview.range]),
    row(['period_start', overview.period.start]),
    row(['period_end', overview.period.end]),
    row(['bytes_in', t.bytes_in]),
    row(['bytes_out', t.bytes_out]),
    row(['packets_in', t.packets_in]),
    row(['packets_out', t.packets_out]),
    row(['windows_count', t.windows_count]),
    row(['alerts_count', t.alerts_count]),
    row(['hosts_count', t.hosts_count]),
    row(['countries_count', t.countries_count]),
    row(['alerts_critical', t.alerts_by_severity.critical]),
    row(['alerts_high', t.alerts_by_severity.high]),
    row(['alerts_medium', t.alerts_by_severity.medium]),
    row(['alerts_low', t.alerts_by_severity.low]),
    row(['alerts_info', t.alerts_by_severity.info]),
    row(['risk_scored_hosts', overview.risk.scored_hosts]),
    row(['risk_high_hosts', overview.risk.high_hosts]),
    row(['risk_medium_hosts', overview.risk.medium_hosts]),
    row(['risk_low_hosts', overview.risk.low_hosts]),
    row(['risk_avg_score', overview.risk.avg_score]),
  ];
  return `${lines.join('\n')}\n`;
}
