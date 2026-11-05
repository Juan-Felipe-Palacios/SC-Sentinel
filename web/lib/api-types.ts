// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Tipos espejo de las respuestas de /api/query (lib/query/*). Mantener en sync.

import type { QueryRange } from '@/lib/schemas/query';

export interface Period {
  start: string;
  end: string;
}

export interface OverviewTotals {
  bytes_in: number;
  bytes_out: number;
  packets_in: number;
  packets_out: number;
  windows_count: number;
  alerts_count: number;
}

export interface OverviewSeriesPoint {
  timestamp: string;
  bytes_in: number;
  bytes_out: number;
}

export interface OverviewTopHost {
  host_key: string;
  country: string | null;
  bytes_total: number;
  packets: number;
}

export interface OverviewTopCountry {
  country: string;
  bytes_total: number;
  hosts_count: number;
}

export interface OverviewResponse {
  range: QueryRange;
  period: Period;
  totals: OverviewTotals;
  series: OverviewSeriesPoint[];
  top_hosts: OverviewTopHost[];
  top_countries: OverviewTopCountry[];
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
  /** ADR-0010: null en devices enrolados antes de la migración 0003. */
  token_expires_at: string | null;
}

/** `GET /api/devices` */
export interface DevicesResponse {
  devices: Device[];
}

/** `POST /api/devices/enroll` y `POST /api/devices/[id]/rotate`: el token solo llega una vez. */
export interface EnrollResponse {
  device_id: string;
  token: string;
  expires_at: string;
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
  last_error: string | null;
  recorded_at: string | null;
}
