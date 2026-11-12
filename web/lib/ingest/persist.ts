// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Persistencia transaccional del ingest (ADR-0008 + ADR-0015).
//
// Motivo: el route hacía seis escrituras sueltas (batch, ventana, host_stats,
// alerts, agent_health, devices). Si una fallaba a mitad, el batch y la ventana
// quedaban guardados y el 500 mandaba al agente a reintentar; el reintento
// encontraba `existingBatch` y devolvía `duplicate` sin escribir los
// secundarios. Resultado: ventanas huérfanas de host_stats y agent_health vacío.
//
// Ahora todas las escrituras viajan en una única transacción no interactiva
// (`sql.transaction`, el driver HTTP de Neon) y cada fila tiene un id
// determinista derivado del contenido. Eso da dos garantías:
//   1. o se guarda todo o no se guarda nada (no quedan ventanas a medias);
//   2. reenviar la misma ventana es idempotente y repara lo que faltara, así
//      que un reintento del agente nunca vuelve a dejar huecos.

import { createHash } from 'crypto';
import { alertDeadlines } from '@/lib/alerts/policy';

/** Etiqueta `sql` del driver de Neon (o un doble en tests). */
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => unknown;

export interface HostStatInput {
  hostKey: string;
  ipDisplay: string | null;
  bytesIn: number;
  bytesOut: number;
  packets: number;
  country: string | null;
  riskScore: number;
}

export interface AlertInput {
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  evidence: unknown;
}

export interface AgentHealthInput {
  captureStatus: string;
  packetsSeen: number;
  packetsDropped: number;
  parseErrors: number;
  queueDepth: number | null;
  spoolBytes: number | null;
  collectorPacketsReceived: number | null;
  collectorPacketsDropped: number | null;
  collectorParseErrors: number | null;
  collectorTemplatesCached: number | null;
  collectorFlowsNormalized: number | null;
  lastError: string | null;
}

export interface PersistInput {
  deviceId: string;
  windowId: string;
  payloadHash: string;
  start: Date;
  end: Date;
  sequence: number;
  snapshot: unknown;
  hostStats: HostStatInput[];
  alerts: AlertInput[];
  health: AgentHealthInput;
  /** Solo se envía cuando el device acaba de enrolarse (ADR-0010). */
  promoteToActive: boolean;
}

/**
 * Id estable a partir del contenido: mismo (ventana, host) → mismo id, así el
 * `ON CONFLICT DO NOTHING` convierte un reintento en un no-op en lugar de un
 * duplicado. 24 hex = 96 bits, holgado para colisiones dentro de una ventana.
 */
export function stableId(prefix: string, ...parts: (string | number)[]): string {
  const digest = createHash('sha256').update(parts.join('\u0000')).digest('hex');
  return `${prefix}_${digest.slice(0, 24)}`;
}

/**
 * Construye la lista de sentencias que se ejecutarán como una sola transacción.
 * La primera devuelve la fila insertada del batch: si viene vacía es que la
 * ventana ya estaba registrada (reintento) y la respuesta es `duplicate`.
 */
export function buildPersistStatements(sql: SqlTag, input: PersistInput): unknown[] {
  const batchId = stableId('bat', input.deviceId, input.windowId);
  const windowDbId = stableId('win', input.deviceId, input.windowId);
  const statements: unknown[] = [];

  statements.push(sql`
    INSERT INTO ingest_batches (id, device_id, window_id, payload_hash, status)
    VALUES (${batchId}, ${input.deviceId}, ${input.windowId}, ${input.payloadHash}, 'processed')
    ON CONFLICT DO NOTHING
    RETURNING id`);

  // UNIQUE(device_id, start_at): otro window_id para el mismo intervalo no
  // crea una ventana nueva, igual que antes del cambio.
  statements.push(sql`
    INSERT INTO flow_windows (id, batch_id, device_id, window_id, start_at, end_at, sequence, snapshot_json)
    VALUES (${windowDbId}, ${batchId}, ${input.deviceId}, ${input.windowId},
            ${input.start.toISOString()}::timestamptz, ${input.end.toISOString()}::timestamptz,
            ${input.sequence}, ${JSON.stringify(input.snapshot)}::jsonb)
    ON CONFLICT DO NOTHING`);

  for (const host of input.hostStats) {
    statements.push(sql`
      INSERT INTO host_stats (id, window_id, host_key, ip_display, bytes_in, bytes_out, packets, country, risk_score)
      VALUES (${stableId('hst', input.windowId, host.hostKey, host.ipDisplay ?? '')},
              ${input.windowId}, ${host.hostKey}, ${host.ipDisplay}, ${host.bytesIn}, ${host.bytesOut},
              ${host.packets}, ${host.country}, ${String(host.riskScore)})
      ON CONFLICT DO NOTHING`);
  }

  for (const alert of input.alerts) {
    const deadlines = alertDeadlines(alert.severity, input.start);
    statements.push(sql`
      INSERT INTO alerts (id, window_id, rule_id, severity, title, description, evidence, sla_due_at, expires_at)
      VALUES (${stableId('alt', input.windowId, alert.ruleId, alert.title)},
              ${input.windowId}, ${alert.ruleId}, ${alert.severity}, ${alert.title}, ${alert.description},
              ${JSON.stringify(alert.evidence ?? null)}::jsonb, ${deadlines.slaDueAt.toISOString()}::timestamptz,
              ${deadlines.expiresAt.toISOString()}::timestamptz)
      ON CONFLICT DO NOTHING`);
  }

  const h = input.health;
  statements.push(sql`
    INSERT INTO agent_health (id, device_id, capture_status, packets_seen, packets_dropped, parse_errors,
                              queue_depth, spool_bytes, collector_packets_received, collector_packets_dropped,
                              collector_parse_errors, collector_templates_cached, collector_flows_normalized, last_error)
    VALUES (${stableId('hlt', input.windowId)}, ${input.deviceId}, ${h.captureStatus}, ${h.packetsSeen},
            ${h.packetsDropped}, ${h.parseErrors}, ${h.queueDepth}, ${h.spoolBytes},
            ${h.collectorPacketsReceived}, ${h.collectorPacketsDropped}, ${h.collectorParseErrors},
            ${h.collectorTemplatesCached}, ${h.collectorFlowsNormalized}, ${h.lastError})
    ON CONFLICT DO NOTHING`);

  statements.push(
    input.promoteToActive
      ? sql`UPDATE devices SET last_seen_at = now(), status = 'active' WHERE id = ${input.deviceId}`
      : sql`UPDATE devices SET last_seen_at = now() WHERE id = ${input.deviceId}`
  );

  return statements;
}
