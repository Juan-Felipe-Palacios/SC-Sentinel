// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Heurística de respaldo en la nube (ADR-0005, nota 2026-11-08): el motor
// determinista local (sc-detect) está en fase de desarrollo y todavía no emite
// risk_score ni alerts en el snapshot del agente. Mientras tanto, el backend
// evalúa señales deterministas del propio payload para garantizar la
// visibilidad operativa del dashboard (la tarjeta "Riesgo del sistema").

import type { Alert, WindowSnapshot } from '@/lib/schemas/ingest';

/** Identificador de regla de la alerta heurística (contrato alert.v1: ^[a-z0-9_]+$). */
export const CLOUD_HEURISTIC_RULE_ID = 'cloud_heuristic';

/** Ventana de dedup: no repetir la alerta cloud_heuristic de un device en 1 hora. */
export const HEURISTIC_ALERT_DEDUP_MS = 60 * 60_000;

/** Piso del riesgo: sin señales sospechosas el riesgo se considera bajo. */
const BASELINE_SCORE = 0.1;

/** Umbrales de banda (misma escala que overview.ts: >=0.7 alto, >=0.4 medio). */
const SCORE_HIGH = 0.7;
const SCORE_MEDIUM = 0.4;

/** Severidad máxima de las alertas del agente -> score 0-1. */
const AGENT_SEVERITY_SCORE: Record<Alert['severity'], number> = {
  info: 0.1,
  low: 0.3,
  medium: 0.5,
  high: 0.85,
  critical: 0.9,
};

const SEVERITY_RANK: Record<Alert['severity'], number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Puertos con historial de explotación/escaneo (telnet, SMB, RDP, BD, caché...). */
const RISKY_PORTS = new Set([
  23, 135, 139, 445, 1433, 2049, 3306, 3389, 5432, 5900, 6379, 11211, 27017,
]);

/** Inundación: al menos 50 paquetes caídos y 20% o más del tráfico descartado. */
const MIN_DROPPED_PACKETS = 50;
const MAX_DROP_RATIO = 0.2;

export type RiskBand = 'high' | 'medium' | 'low';

export function riskBandOf(score: number): RiskBand {
  if (score >= SCORE_HIGH) return 'high';
  if (score >= SCORE_MEDIUM) return 'medium';
  return 'low';
}

export interface CloudRiskEvaluation {
  /** Score 0-1 de la ventana, aplicado a los hosts sin risk_score propio. */
  score: number;
  band: RiskBand;
  /** Señales que disparan el score (evidencia y logs). */
  signals: string[];
  /**
   * Alerta cloud_heuristic a persistir, o null cuando no corresponde:
   * el agente ya emitió alertas (manda él) o el riesgo quedó en banda baja.
   */
  alert: Alert | null;
}

/**
 * Evalúa las señales deterministas disponibles en el snapshot de la ventana.
 *
 * Señales (en orden de fuerza, gana el máximo):
 *  1. Severidad máxima de snapshot.alerts (cuando sc-detect emita alertas).
 *  2. Salud del agente: capture_status error/degraded, last_error presente.
 *  3. Puertos de riesgo en top_ports (1 puerto -> medio, 2 o mas -> alto).
 *  4. Ratio de paquetes caidos (posible inundacion/saturacion de captura).
 *
 * Sin senales el score es el piso (banda baja). El score es a nivel de
 * ventana: top_ports y health son agregados globales, no por host.
 */
export function evaluateCloudRisk(snapshot: WindowSnapshot): CloudRiskEvaluation {
  const signals: string[] = [];
  let score = BASELINE_SCORE;

  // 1) Alertas del agente (si existen, la nube no agrega la suya).
  let maxSeverity: Alert['severity'] | null = null;
  for (const a of snapshot.alerts) {
    if (!maxSeverity || SEVERITY_RANK[a.severity] > SEVERITY_RANK[maxSeverity]) {
      maxSeverity = a.severity;
    }
  }
  if (maxSeverity) {
    score = Math.max(score, AGENT_SEVERITY_SCORE[maxSeverity]);
    signals.push(`agent_alert:${maxSeverity}`);
  }

  // 2) Salud del agente.
  const health = snapshot.health;
  if (health.capture_status === 'error') {
    score = Math.max(score, SCORE_HIGH);
    signals.push('capture_error');
  } else if (health.capture_status === 'degraded') {
    score = Math.max(score, 0.45);
    signals.push('capture_degraded');
  }
  if (health.last_error) {
    score = Math.max(score, 0.45);
    signals.push('last_error');
  }

  // 3) Puertos de riesgo en la ventana.
  const riskyPorts = snapshot.top_ports
    .map((p) => p.port)
    .filter((port) => RISKY_PORTS.has(port))
    .sort((a, b) => a - b);
  if (riskyPorts.length >= 2) {
    score = Math.max(score, 0.85);
    signals.push(`risky_ports:${riskyPorts.slice(0, 5).join(',')}`);
  } else if (riskyPorts.length === 1) {
    score = Math.max(score, 0.5);
    signals.push(`risky_port:${riskyPorts[0]}`);
  }

  // 4) Paquetes caidos (inundacion o saturacion de la captura).
  const dropped = health.packets_dropped;
  const total = health.packets_seen + dropped;
  if (dropped >= MIN_DROPPED_PACKETS && total > 0 && dropped / total >= MAX_DROP_RATIO) {
    score = Math.max(score, 0.45);
    signals.push('packet_drop');
  }

  const band = riskBandOf(score);
  const agentEmittedAlerts = snapshot.alerts.length > 0;
  const alert: Alert | null =
    !agentEmittedAlerts && score >= SCORE_MEDIUM
      ? {
          rule_id: CLOUD_HEURISTIC_RULE_ID,
          severity: band === 'high' ? 'high' : 'medium',
          title: 'Riesgo evaluado por patrón de evento (agente en modo desarrollo)',
          description:
            'Enriquecimiento heurístico de respaldo en la nube: el motor determinista local (sc-detect) está en fase de desarrollo.',
          evidence: {
            source: 'cloud_heuristic_v1',
            score: score.toFixed(2),
            signals: signals.join(',') || 'none',
          },
        }
      : null;

  return { score, band, signals, alert };
}

/**
 * Score final por host: el valor del agente (sc-detect) siempre manda;
 * solo se rellena cuando el agente no envió score (null) o envió 0.
 */
export function resolveHostRiskScore(
  agentScore: number | null | undefined,
  windowScore: number
): number {
  if (agentScore != null && agentScore > 0) return agentScore;
  return windowScore;
}
