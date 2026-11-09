// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Tipos espejo de las respuestas de /api/query (lib/query/*). Mantener en sync.

import type { QueryRange } from '@/lib/schemas/query';

export interface Period {
  start: string;
  end: string;
}

export interface OverviewAlertSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface OverviewTotals {
  bytes_in: number;
  bytes_out: number;
  packets_in: number;
  packets_out: number;
  windows_count: number;
  alerts_count: number;
  /** Hosts distintos en el período. */
  hosts_count: number;
  /** Países distintos (excluye el centinela `LAN`). */
  countries_count: number;
  alerts_by_severity: OverviewAlertSeverityCounts;
}

export interface OverviewSeriesPoint {
  timestamp: string;
  bytes_in: number;
  bytes_out: number;
}

export interface OverviewTopHost {
  host_key: string;
  /** IP legible del host (IPv4/IPv6); null cuando el agente anonimiza. */
  ip: string | null;
  /** Nombre resuelto por DNS inverso en el servidor; null si no se pudo resolver. */
  hostname: string | null;
  country: string | null;
  /** Último risk_score determinista (0.0–1.0); null si no hay score. */
  risk_score: number | null;
  bytes_in: number;
  bytes_out: number;
  bytes_total: number;
  packets: number;
}

export interface OverviewRisk {
  /** Hosts con risk_score observado en el período. */
  scored_hosts: number;
  high_hosts: number;
  medium_hosts: number;
  low_hosts: number;
  /** Promedio de los scores (0.0–1.0); null si ningún host tiene score. */
  avg_score: number | null;
}

export interface OverviewTopCountry {
  country: string;
  bytes_total: number;
  hosts_count: number;
}

export interface OverviewTopPort {
  port: number;
  protocol: string;
  bytes: number;
  connections: number;
}

export interface OverviewProtocolShare {
  protocol: string;
  bytes: number;
  connections: number;
}

export interface OverviewResponse {
  range: QueryRange;
  period: Period;
  totals: OverviewTotals;
  series: OverviewSeriesPoint[];
  top_hosts: OverviewTopHost[];
  top_countries: OverviewTopCountry[];
  top_ports: OverviewTopPort[];
  protocols: OverviewProtocolShare[];
  risk: OverviewRisk;
}

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

export interface AlertsResponse {
  range: QueryRange;
  alerts: AlertItem[];
  total: number;
}

/** metric=hosts — lista de hosts del período (drill-down nivel 2). */
export interface HostMetricItem {
  host_key: string;
  ip: string | null;
  country: string | null;
  bytes_in: number;
  bytes_out: number;
  packets: number;
  risk_score: number | null;
  first_seen: string | null;
  last_seen: string | null;
}

export interface HostsResponse {
  range: QueryRange;
  hosts: HostMetricItem[];
  total: number;
}

/** metric=host — drill-down de un host ventana por ventana. */
export interface HostDetailPoint {
  /** Inicio de la ventana agregada (30 s). */
  timestamp: string;
  bytes_in: number;
  bytes_out: number;
  packets: number;
  /** Alertas de esa ventana (de cualquier host): correlación temporal. */
  alert_count: number;
}

export interface HostDetailResponse {
  range: QueryRange;
  host_key: string;
  ip: string | null;
  country: string | null;
  risk_score: number | null;
  period: Period;
  totals: {
    bytes_in: number;
    bytes_out: number;
    packets: number;
    windows_count: number;
    alerts_count: number;
  };
  series: HostDetailPoint[];
}

/** metric=heatmap — matriz hora UTC × puerto del período. */
export interface HeatmapPort {
  port: number;
  protocol: string;
  bytes: number;
}

export interface HeatmapResponse {
  range: QueryRange;
  period: Period;
  /** Filas: hora UTC del día (0–23). */
  hours: number[];
  ports: HeatmapPort[];
  /** `cells[hora][puerto]` en bytes; mismo orden que `ports`. */
  cells: number[][];
  max: number;
  total_bytes: number;
}

export interface AiFinding {
  type: string;
  description: string;
  severity: string;
}

export interface AiInsight {
  id: string;
  device_id: string;
  period_start: string;
  period_end: string;
  model: string;
  status: 'ok' | 'degraded';
  /** Idioma del texto generado (español por defecto). */
  language: 'es' | 'en';
  /** Riesgo §11.2 persistido (null solo en filas previas a la migración 0002). */
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  summary: string;
  findings: AiFinding[];
  recommendations: string[];
  facts_hash: string;
  created_at: string;
}

/** `/api/query?metric=ai` responde `{}` cuando todavía no hay análisis persistido. */
export type AiInsightResponse = AiInsight | Record<string, never>;

export interface Device {
  id: string;
  name: string | null;
  status: 'active' | 'enrolled_pending' | 'revoked' | string;
  enrolled_at: string;
  last_seen_at: string | null;
}

/** `GET /api/devices` */
export interface DevicesResponse {
  devices: Device[];
}

/** `POST /api/devices/enroll`: el token solo llega una vez y no expira. */
export interface EnrollResponse {
  device_id: string;
  token: string;
  device: Device;
}

export interface HealthMetric {
  device_id: string | null;
  capture_status: string | null;
  packets_seen: number;
  packets_dropped: number;
  parse_errors: number;
  queue_depth: number | null;
  spool_bytes: number | null;
  collector_packets_received: number | null;
  collector_packets_dropped: number | null;
  collector_parse_errors: number | null;
  collector_templates_cached: number | null;
  collector_flows_normalized: number | null;
  last_error: string | null;
  recorded_at: string | null;
}

export interface EvalsResponse {
  success_rate: number | null;
  total: number;
  succeeded: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  daily_cost: Array<{ day: string; cost_usd: number }>;
  by_model: Array<{ model: string; total: number; cost_usd: number; latency_p50_ms: number | null }>;
}
