// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Dataset sintético determinista de la demo pública.
//
// La sesión de visitante NO consulta la base: este módulo genera las respuestas
// de /api/query a partir de datos fijos y un generador pseudoaleatorio sembrado
// por el rango. Así la demo no consume Neon, no retiene datos y no puede mostrar
// tráfico real por error.

import type {
  AiInsight,
  AlertItem,
  AlertsResponse,
  HealthMetric,
  HeatmapResponse,
  HostDetailResponse,
  HostMetricItem,
  HostsResponse,
  OverviewResponse,
  OverviewTopHost,
} from '@/lib/api-types';
import { getRangeBounds, type RangeBounds } from '@/lib/query/range';
import type { QueryRange } from '@/lib/schemas/query';

/** Id reservado para la demo. No existe en la base ni se usa para datos reales. */
export const SYNTHETIC_DEMO_DEVICE_ID = 'dev_demo_synthetic';
export const SYNTHETIC_DEMO_LABEL = 'Datos de demostración';

export function isSyntheticDemoDevice(deviceId: string | null | undefined): boolean {
  return deviceId === SYNTHETIC_DEMO_DEVICE_ID;
}

interface DemoHost {
  host_key: string;
  ip: string;
  country: string;
  risk_score: number;
  weight: number;
}

const HOSTS: readonly DemoHost[] = [
  { host_key: 'demo_edge_ar_01', ip: '192.0.2.10', country: 'AR', risk_score: 0.18, weight: 0.28 },
  { host_key: 'demo_api_us_02', ip: '198.51.100.23', country: 'US', risk_score: 0.42, weight: 0.22 },
  { host_key: 'demo_dns_de_03', ip: '203.0.113.53', country: 'DE', risk_score: 0.12, weight: 0.15 },
  { host_key: 'demo_db_ar_04', ip: '192.0.2.44', country: 'AR', risk_score: 0.67, weight: 0.13 },
  { host_key: 'demo_cdn_nl_05', ip: '198.51.100.80', country: 'NL', risk_score: 0.25, weight: 0.12 },
  { host_key: 'demo_backup_us_06', ip: '203.0.113.90', country: 'US', risk_score: 0.55, weight: 0.1 },
];

const PORTS = [
  { port: 443, protocol: 'tcp', weight: 0.46 },
  { port: 80, protocol: 'tcp', weight: 0.18 },
  { port: 53, protocol: 'udp', weight: 0.12 },
  { port: 22, protocol: 'tcp', weight: 0.08 },
  { port: 123, protocol: 'udp', weight: 0.06 },
  { port: 5432, protocol: 'tcp', weight: 0.05 },
  { port: 3306, protocol: 'tcp', weight: 0.03 },
  { port: 8080, protocol: 'tcp', weight: 0.02 },
];

const ASNS = [
  { asn: 13335, asn_org: 'Cloudflare, Inc.', weight: 0.34, hosts: 2 },
  { asn: 15169, asn_org: 'Google LLC', weight: 0.26, hosts: 2 },
  { asn: 16509, asn_org: 'Amazon.com, Inc.', weight: 0.21, hosts: 1 },
  { asn: 8075, asn_org: 'Microsoft Corporation', weight: 0.12, hosts: 1 },
  { asn: 14618, asn_org: 'Amazon AES', weight: 0.07, hosts: 1 },
];

const WINDOWS_BY_RANGE: Record<QueryRange, number> = {
  '15m': 30,
  '1h': 120,
  '6h': 720,
  '24h': 2880,
  '7d': 20160,
  '30d': 86400,
};

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function periodFor(
  range: QueryRange,
  now: Date,
  bounds?: RangeBounds
): { start: Date; end: Date } {
  const resolved = bounds ?? getRangeBounds(range, now);
  return { start: resolved.start, end: resolved.end };
}

function totalsFor(range: QueryRange): { bytesIn: number; bytesOut: number } {
  const base = { '15m': 1.8, '1h': 7.4, '6h': 41, '24h': 168, '7d': 1180, '30d': 5100 }[range];
  return {
    bytesIn: Math.round(base * 1_000_000_000 * 0.62),
    bytesOut: Math.round(base * 1_000_000_000 * 0.38),
  };
}

function seriesFor(
  range: QueryRange,
  start: Date,
  end: Date,
  totals: { bytesIn: number; bytesOut: number }
): OverviewResponse['series'] {
  const random = makeRandom(seedFrom(`series:${range}`));
  const phase = random() * Math.PI * 2;
  const points = 60;
  const span = Math.max(1, end.getTime() - start.getTime());
  const raw = Array.from({ length: points }, (_, index) => {
    const wave = 0.72 + 0.22 * Math.sin(index / 5 + phase) + 0.06 * Math.sin(index / 2.3);
    return { wave, jitter: 0.92 + random() * 0.16 };
  });
  const rawIn = raw.reduce((sum, point) => sum + point.wave * point.jitter, 0);
  const rawOut = raw.reduce((sum, point) => sum + point.wave * (1.08 - point.jitter * 0.08), 0);

  return raw.map((point, index) => ({
    timestamp: new Date(start.getTime() + (span * index) / (points - 1)).toISOString(),
    bytes_in: Math.round((totals.bytesIn * point.wave * point.jitter) / rawIn),
    bytes_out: Math.round(
      (totals.bytesOut * point.wave * (1.08 - point.jitter * 0.08)) / rawOut
    ),
  }));
}

function hostsFor(totals: { bytesIn: number; bytesOut: number }): OverviewTopHost[] {
  return HOSTS.map((host) => {
    const bytesIn = Math.round(totals.bytesIn * host.weight);
    const bytesOut = Math.round(totals.bytesOut * host.weight);
    return {
      host_key: host.host_key,
      ip: host.ip,
      hostname: null,
      country: host.country,
      risk_score: host.risk_score,
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      bytes_total: bytesIn + bytesOut,
      packets: Math.round((bytesIn + bytesOut) / 920),
    };
  }).sort((a, b) => b.bytes_total - a.bytes_total);
}

function portsFor(totals: { bytesIn: number; bytesOut: number }): OverviewResponse['top_ports'] {
  const total = totals.bytesIn + totals.bytesOut;
  return PORTS.map((entry) => ({
    port: entry.port,
    protocol: entry.protocol,
    bytes: Math.round(total * entry.weight),
    connections: Math.round((total * entry.weight) / 18_000),
  }));
}

function protocolsFor(ports: OverviewResponse['top_ports']): OverviewResponse['protocols'] {
  const byProtocol = new Map<string, { bytes: number; connections: number }>();
  for (const port of ports) {
    const current = byProtocol.get(port.protocol) ?? { bytes: 0, connections: 0 };
    current.bytes += port.bytes;
    current.connections += port.connections;
    byProtocol.set(port.protocol, current);
  }
  return Array.from(byProtocol, ([protocol, value]) => ({ protocol, ...value })).sort(
    (a, b) => b.bytes - a.bytes
  );
}

function countriesFor(
  hosts: OverviewTopHost[]
): OverviewResponse['top_countries'] {
  const byCountry = new Map<string, { bytes_total: number; hosts_count: number }>();
  for (const host of hosts) {
    if (!host.country || host.country === 'LAN') continue;
    const current = byCountry.get(host.country) ?? { bytes_total: 0, hosts_count: 0 };
    current.bytes_total += host.bytes_total;
    current.hosts_count += 1;
    byCountry.set(host.country, current);
  }
  return Array.from(byCountry, ([country, value]) => ({ country, ...value }))
    .sort((a, b) => b.bytes_total - a.bytes_total)
    .slice(0, 5);
}

function asnsFor(totals: number): OverviewResponse['top_asns'] {
  return ASNS.map((entry) => ({
    asn: entry.asn,
    asn_org: entry.asn_org,
    bytes_total: Math.round(totals * entry.weight),
    hosts: entry.hosts,
  })).sort((a, b) => b.bytes_total - a.bytes_total);
}

function riskFor(hosts: OverviewTopHost[]): OverviewResponse['risk'] {
  const scores = hosts
    .map((host) => host.risk_score)
    .filter((score): score is number => score !== null);
  const avg = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  return {
    scored_hosts: scores.length,
    high_hosts: scores.filter((score) => score >= 0.7).length,
    medium_hosts: scores.filter((score) => score >= 0.4 && score < 0.7).length,
    low_hosts: scores.filter((score) => score < 0.4).length,
    avg_score: avg,
  };
}

export function syntheticOverview(
  range: QueryRange,
  now: Date = new Date(),
  bounds?: RangeBounds
): OverviewResponse {
  const period = periodFor(range, now, bounds);
  const totals = totalsFor(range);
  const series = seriesFor(range, period.start, period.end, totals);
  const hosts = hostsFor(totals);
  const ports = portsFor(totals);
  const alerts = syntheticAlerts(range, now);
  const totalBytes = totals.bytesIn + totals.bytesOut;

  return {
    range,
    period: { start: period.start.toISOString(), end: period.end.toISOString() },
    last_data_at: now.toISOString(),
    last_traffic_at: now.toISOString(),
    totals: {
      bytes_in: totals.bytesIn,
      bytes_out: totals.bytesOut,
      packets_in: hosts.reduce((sum, host) => sum + host.packets, 0),
      packets_out: hosts.reduce((sum, host) => sum + host.packets, 0),
      windows_count: WINDOWS_BY_RANGE[range],
      alerts_count: alerts.total,
      hosts_count: hosts.length,
      countries_count: new Set(hosts.map((host) => host.country).filter(Boolean)).size,
      alerts_by_severity: alerts.alerts.reduce(
        (counts, alert) => {
          const key = alert.severity as keyof typeof counts;
          if (key in counts) counts[key] += 1;
          return counts;
        },
        { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
      ),
    },
    series,
    top_hosts: hosts,
    top_countries: countriesFor(hosts),
    top_asns: asnsFor(totalBytes),
    top_ports: ports,
    protocols: protocolsFor(ports),
    risk: riskFor(hosts),
  };
}

export function syntheticAlerts(
  range: QueryRange,
  now: Date = new Date()
): AlertsResponse {
  const created = (minutesAgo: number) =>
    new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const alerts: AlertItem[] = [
    {
      id: 'alert_demo_001',
      window_id: 'window_demo_001',
      rule_id: 'port_scan_detected',
      severity: 'high',
      title: 'Escaneo de puertos desde un host externo',
      description:
        'Un host de demostración probó varios puertos en menos de una ventana. Evidencia sintética.',
      evidence: { demo: true, destination_ports: [22, 80, 443], attempts: 42 },
      created_at: created(12),
      status: 'open',
      assignee: null,
      assignee_operator_id: null,
      acknowledged_at: null,
      resolved_at: null,
      sla_due_at: new Date(now.getTime() + 45 * 60_000).toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      sla_breached: false,
      sla_remaining_seconds: 2700,
      updated_at: created(12),
      notes_count: 0,
    },
    {
      id: 'alert_demo_002',
      window_id: 'window_demo_002',
      rule_id: 'unusual_dns_volume',
      severity: 'medium',
      title: 'Volumen DNS por encima del patrón',
      description:
        'El host de demostración generó más consultas DNS que su línea base. Dato sintético.',
      evidence: { demo: true, queries: 1840, baseline: 720 },
      created_at: created(48),
      status: 'acknowledged',
      assignee: 'Operador de demostración',
      assignee_operator_id: null,
      acknowledged_at: created(40),
      resolved_at: null,
      sla_due_at: new Date(now.getTime() + 2 * 60 * 60_000).toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      sla_breached: false,
      sla_remaining_seconds: 7200,
      updated_at: created(40),
      notes_count: 1,
    },
    {
      id: 'alert_demo_003',
      window_id: 'window_demo_003',
      rule_id: 'egress_spike',
      severity: 'low',
      title: 'Pico de salida en la ventana',
      description:
        'La transferencia de salida superó el umbral de demostración durante una ventana. Dato sintético.',
      evidence: { demo: true, bytes_out: 28_400_000, threshold: 22_000_000 },
      created_at: created(95),
      status: 'resolved',
      assignee: 'Operador de demostración',
      assignee_operator_id: null,
      acknowledged_at: created(90),
      resolved_at: created(70),
      sla_due_at: new Date(now.getTime() - 30 * 60_000).toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      sla_breached: false,
      sla_remaining_seconds: 0,
      updated_at: created(70),
      notes_count: 2,
    },
    {
      id: 'alert_demo_004',
      window_id: 'window_demo_004',
      rule_id: 'new_host_observed',
      severity: 'info',
      title: 'Host nuevo observado en la demo',
      description:
        'Un host sintético apareció por primera vez en el período. No representa tráfico real.',
      evidence: { demo: true, host_key: 'demo_cdn_nl_05' },
      created_at: created(160),
      status: 'expired',
      assignee: null,
      assignee_operator_id: null,
      acknowledged_at: null,
      resolved_at: null,
      sla_due_at: null,
      expires_at: created(20),
      sla_breached: false,
      sla_remaining_seconds: 0,
      updated_at: created(160),
      notes_count: 0,
    },
  ];

  return { range, alerts, total: alerts.length };
}

export function syntheticHosts(
  range: QueryRange,
  now: Date = new Date(),
  bounds?: RangeBounds
): HostsResponse {
  const overview = syntheticOverview(range, now, bounds);
  const hosts: HostMetricItem[] = overview.top_hosts.map((host) => ({
    host_key: host.host_key,
    ip: host.ip,
    country: host.country,
    bytes_in: host.bytes_in,
    bytes_out: host.bytes_out,
    packets: host.packets,
    risk_score: host.risk_score,
    first_seen: overview.period.start,
    last_seen: overview.period.end,
  }));
  return { range, hosts, total: hosts.length };
}

export function syntheticHostDetail(
  hostKey: string,
  range: QueryRange,
  now: Date = new Date(),
  bounds?: RangeBounds
): HostDetailResponse {
  const overview = syntheticOverview(range, now, bounds);
  const host = overview.top_hosts.find((candidate) => candidate.host_key === hostKey);
  if (!host) {
    return {
      range,
      host_key: hostKey,
      ip: null,
      country: null,
      risk_score: null,
      period: overview.period,
      totals: { bytes_in: 0, bytes_out: 0, packets: 0, windows_count: 0, alerts_count: 0 },
      series: [],
    };
  }

  const random = makeRandom(seedFrom(`host:${hostKey}:${range}`));
  const points = 30;
  const span = Date.parse(overview.period.end) - Date.parse(overview.period.start);
  const series = Array.from({ length: points }, (_, index) => {
    const factor = 0.7 + random() * 0.55;
    return {
      timestamp: new Date(Date.parse(overview.period.start) + (span * index) / (points - 1)).toISOString(),
      bytes_in: Math.round((host.bytes_in / points) * factor),
      bytes_out: Math.round((host.bytes_out / points) * factor),
      packets: Math.round((host.packets / points) * factor),
      alert_count: index === 9 ? 1 : 0,
    };
  });

  return {
    range,
    host_key: host.host_key,
    ip: host.ip,
    country: host.country,
    risk_score: host.risk_score,
    period: overview.period,
    totals: {
      bytes_in: series.reduce((sum, point) => sum + point.bytes_in, 0),
      bytes_out: series.reduce((sum, point) => sum + point.bytes_out, 0),
      packets: series.reduce((sum, point) => sum + point.packets, 0),
      windows_count: points,
      alerts_count: 1,
    },
    series,
  };
}

export function syntheticHeatmap(
  range: QueryRange,
  now: Date = new Date(),
  bounds?: RangeBounds
): HeatmapResponse {
  const overview = syntheticOverview(range, now, bounds);
  const ports = overview.top_ports.slice(0, 6).map((port) => ({
    port: port.port,
    protocol: port.protocol,
    bytes: port.bytes,
  }));
  const random = makeRandom(seedFrom(`heatmap:${range}`));
  const cells = Array.from({ length: 24 }, () =>
    ports.map((port) => Math.round((port.bytes / 24) * (0.35 + random() * 1.3)))
  );
  const flat = cells.flat();
  return {
    range,
    period: overview.period,
    hours: Array.from({ length: 24 }, (_, hour) => hour),
    ports,
    cells,
    max: flat.length ? Math.max(...flat) : 0,
    total_bytes: flat.reduce((sum, value) => sum + value, 0),
  };
}

export function syntheticHealth(now: Date = new Date()): HealthMetric {
  return {
    device_id: SYNTHETIC_DEMO_DEVICE_ID,
    capture_status: 'ok',
    packets_seen: 128_450,
    packets_dropped: 12,
    parse_errors: 0,
    queue_depth: 0,
    spool_bytes: 0,
    collector_packets_received: 3_240,
    collector_packets_dropped: 0,
    collector_parse_errors: 0,
    collector_templates_cached: 18,
    collector_flows_normalized: 9_812,
    last_error: null,
    recorded_at: now.toISOString(),
  };
}

export function syntheticInsight(
  language: 'es' | 'en' = 'es',
  now: Date = new Date()
): AiInsight {
  const isSpanish = language === 'es';
  return {
    id: 'ins_demo_synthetic',
    device_id: SYNTHETIC_DEMO_DEVICE_ID,
    period_start: new Date(now.getTime() - 60 * 60_000).toISOString(),
    period_end: now.toISOString(),
    model: 'demo-synthetic',
    status: 'ok',
    language,
    risk_level: 'low',
    summary: isSpanish
      ? 'Datos de demostración: el tráfico sintético se mantiene estable, con un pico puntual de salida y un escaneo de puertos simulado. No corresponde a tráfico real.'
      : 'Demo data: synthetic traffic is stable, with a brief egress spike and a simulated port scan. This is not real traffic.',
    findings: [
      {
        type: 'ports',
        description: isSpanish
          ? 'El puerto 443 concentra la mayor parte del volumen sintético.'
          : 'Port 443 carries most of the synthetic volume.',
        severity: 'info',
      },
      {
        type: 'alerts',
        description: isSpanish
          ? 'Hay una alerta sintética abierta por escaneo de puertos.'
          : 'One synthetic port-scan alert is open.',
        severity: 'low',
      },
    ],
    recommendations: isSpanish
      ? ['Revisar la alerta abierta de demostración.', 'Usar la demo solo como referencia visual.']
      : ['Review the open demo alert.', 'Use the demo as a visual reference only.'],
    facts_hash: 'demo-synthetic',
    created_at: now.toISOString(),
  };
}
