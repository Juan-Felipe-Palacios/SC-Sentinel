// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//
// Traducción del bloque `ot` ya validado (segunda pasada) a lo que se persiste:
//   - alertas, con `client` y `server` en `evidence` para que la card E8.1 pueda
//     dibujar aristas reales sin inventar enlaces;
//   - activos para `ot_assets`, agregados por `host_key`.
//
// Es código puro: no toca la base ni el request, así que se prueba sin PGlite.

import type { OtAssetSeed } from './upsert';
import type { OtBlock, OtEvent, OtRole } from '@/lib/schemas/ingest';

/** Tope de claves de `Alert.evidence` en el contrato. */
export const EVIDENCE_MAX_KEYS = 32;
/** Tope de longitud por valor en `Alert.evidence`. */
export const EVIDENCE_VALUE_MAX = 128;

/**
 * Techo de confianza del lado servidor (M6 E7, opción (a)).
 *
 * El diseño pedía degradar `confirmed → hint` cuando `capture_mode == "collector"`,
 * pero el contrato usa `confidence: f64` y `capture_mode` sólo admite
 * `live|offline`, así que `collector` no es representable sin cambiar el contrato.
 * Hasta que exista ese modo, el techo se aplica a las capturas `offline` (spool /
 * replay), que son la fuente menos autoritativa, y se documenta como supuesto
 * (no medido), igual que `cooldown_windows = 120`.
 *
 * Umbral "confirmed": confidence >= 0.9. Techo "hint": 0.7.
 */
export const CONFIRMED_CONFIDENCE = 0.9;
export const COLLECTOR_CONFIDENCE_CEILING = 0.7;

/**
 * Aplica el techo de confianza a un bloque OT de captura `offline`.
 *
 * No muta la entrada: devuelve el bloque (o uno nuevo) con cada evento
 * degradado y el motivo en la evidencia, para que quede rastro en la alerta y
 * se pueda contar cuántas ventanas lo tocaron. `live` pasa intacto.
 *
 * Devuelve también `downgraded`: 0 cuando no hubo cambios, para que el llamador
 * no registre un contador en vano.
 */
export function applyConfidenceCeiling(block: OtBlock): {
  block: OtBlock;
  downgraded: number;
} {
  if (block.capture_mode !== 'offline') return { block, downgraded: 0 };

  let downgraded = 0;
  const events = block.events.map((event) => {
    if (event.confidence < CONFIRMED_CONFIDENCE) return event;
    downgraded += 1;
    return {
      ...event,
      confidence: COLLECTOR_CONFIDENCE_CEILING,
      evidence: {
        ...event.evidence,
        confidence_ceiling: `hint:offline:${COLLECTOR_CONFIDENCE_CEILING}`,
      },
    };
  });

  return {
    block: downgraded === 0 ? block : { ...block, events },
    downgraded,
  };
}

/** Severidades de `docs/reference/detection-rules.md` (tabla de reglas OT). */
const RULE_SEVERITY: Record<string, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
  ot_new_master: 'high',
  ot_program_download: 'high',
  ot_cpu_state_change: 'high',
  ot_write_outside_hours: 'medium',
  ot_it_zone_crossing: 'medium',
};

const RULE_LABEL: Record<string, string> = {
  ot_new_master: 'Maestro OT fuera de allowlist',
  ot_program_download: 'Descarga de programa al PLC',
  ot_cpu_state_change: 'Cambio de estado de CPU del PLC',
  ot_write_outside_hours: 'Escritura OT fuera de horario',
  ot_it_zone_crossing: 'Cruce de zona IT/OT',
};

/** Fila de alerta lista para `buildPersistStatements`. */
export interface OtAlertRow {
  rule_id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence: Record<string, string>;
}

/**
 * Corrección 8 del plan M6: arrays → CSV, números → decimal, valor ≤128 chars y
 * como máximo 32 claves. Se ordena por clave para que la evidencia sea estable
 * (mismo evento → mismo JSON → mismo id determinista).
 */
export function normalizeEvidence(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Object.keys(raw).sort();
  for (const key of entries) {
    if (Object.keys(out).length >= EVIDENCE_MAX_KEYS) break;
    const value = raw[key];
    if (value === null || value === undefined) continue;
    const text = Array.isArray(value) ? value.join(',') : String(value);
    out[key] = text.slice(0, EVIDENCE_VALUE_MAX);
  }
  return out;
}

/**
 * Una alerta por evento OT. El título incluye los extremos porque el id
 * determinista de `alerts` se deriva de (ventana, regla, título): sin ellos, dos
 * pares distintos de la misma regla colapsarían en una sola alerta.
 */
export function alertFromOtEvent(event: OtEvent): OtAlertRow {
  const rest = normalizeEvidence({
    ...event.evidence,
    protocol: event.protocol,
    confidence: event.confidence,
  });
  // `client` y `server` se escriben primero para que el tope de 32 claves no los
  // recorte: E8.1 los usa para unir aristas con `ot_assets`.
  const evidence: Record<string, string> = {
    client: event.client.slice(0, EVIDENCE_VALUE_MAX),
    server: event.server.slice(0, EVIDENCE_VALUE_MAX),
  };
  for (const [key, value] of Object.entries(rest)) {
    if (key === 'client' || key === 'server') continue;
    if (Object.keys(evidence).length >= EVIDENCE_MAX_KEYS) break;
    evidence[key] = value;
  }

  const label = RULE_LABEL[event.rule] ?? event.rule;
  return {
    rule_id: event.rule,
    severity: RULE_SEVERITY[event.rule] ?? 'medium',
    title: `${label} · ${event.protocol} · ${event.client.slice(0, 8)}→${event.server.slice(0, 8)}`,
    description: `${event.protocol}: ${event.client} → ${event.server}`,
    evidence,
  };
}

export function alertsFromOtBlock(block: OtBlock): OtAlertRow[] {
  return block.events.map(alertFromOtEvent);
}

function mergeRole(roles: Set<OtRole>): OtRole {
  if (roles.has('both')) return 'both';
  if (roles.has('client') && roles.has('server')) return 'both';
  if (roles.has('client')) return 'client';
  if (roles.has('server')) return 'server';
  return 'unknown';
}

/**
 * Un activo por `host_key`: roles y protocolos de `endpoints`, y los pares de
 * `events` como `peers` en ambos extremos (la tabla declara los peers por host).
 * El orden es determinista para que un reintento produzca el mismo JSON.
 */
export function assetsFromOtBlock(block: OtBlock): OtAssetSeed[] {
  const hosts = new Map<
    string,
    { roles: Set<OtRole>; protocols: Set<string>; peers: Set<string> }
  >();

  const host = (hostKey: string) => {
    let entry = hosts.get(hostKey);
    if (!entry) {
      entry = { roles: new Set<OtRole>(), protocols: new Set<string>(), peers: new Set<string>() };
      hosts.set(hostKey, entry);
    }
    return entry;
  };

  for (const endpoint of block.endpoints) {
    const entry = host(endpoint.host_key);
    entry.roles.add(endpoint.role);
    entry.protocols.add(endpoint.protocol);
  }

  for (const event of block.events) {
    const client = host(event.client);
    const server = host(event.server);
    client.protocols.add(event.protocol);
    server.protocols.add(event.protocol);
    client.roles.add('client');
    server.roles.add('server');
    client.peers.add(event.server);
    server.peers.add(event.client);
  }

  return [...hosts.keys()].sort().map((hostKey) => {
    const entry = hosts.get(hostKey)!;
    return {
      hostKey,
      role: mergeRole(entry.roles),
      protocols: [...entry.protocols].sort(),
      peers: [...entry.peers].sort(),
    };
  });
}
