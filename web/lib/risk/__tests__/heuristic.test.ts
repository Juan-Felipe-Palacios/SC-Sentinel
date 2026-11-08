// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, it, expect } from 'vitest';
import {
  evaluateCloudRisk,
  resolveHostRiskScore,
  riskBandOf,
  CLOUD_HEURISTIC_RULE_ID,
} from '../heuristic';
import { AlertSchema, type WindowSnapshot } from '@/lib/schemas/ingest';

function snapshot(overrides: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    top_hosts: [],
    top_ports: [],
    top_countries: [],
    alerts: [],
    health: {
      capture_status: 'ok',
      packets_seen: 10_000,
      packets_dropped: 0,
      parse_errors: 0,
    },
    ...overrides,
  };
}

describe('evaluateCloudRisk', () => {
  it('asigna el piso (banda baja) en una ventana limpia', () => {
    const result = evaluateCloudRisk(snapshot());

    expect(result.score).toBe(0.1);
    expect(result.band).toBe('low');
    expect(result.signals).toEqual([]);
    expect(result.alert).toBeNull();
  });

  it('toma la severidad maxima de las alertas del agente', () => {
    const result = evaluateCloudRisk(
      snapshot({
        alerts: [
          { rule_id: 'port_scan', severity: 'low', title: 'Escaneo menor' },
          { rule_id: 'blacklist_hit', severity: 'high', title: 'IP en blacklist' },
        ],
      })
    );

    expect(result.score).toBe(0.85);
    expect(result.band).toBe('high');
    expect(result.signals).toContain('agent_alert:high');
    // El agente ya emitió alertas: la nube no agrega la suya.
    expect(result.alert).toBeNull();
  });

  it('marca banda alta cuando capture_status es error', () => {
    const result = evaluateCloudRisk(
      snapshot({ health: { capture_status: 'error', packets_seen: 1, packets_dropped: 0, parse_errors: 0 } })
    );

    expect(result.score).toBe(0.7);
    expect(result.band).toBe('high');
    expect(result.signals).toContain('capture_error');
    expect(result.alert).toMatchObject({
      rule_id: CLOUD_HEURISTIC_RULE_ID,
      severity: 'high',
    });
  });

  it('marca banda media con capture degraded o last_error', () => {
    const degraded = evaluateCloudRisk(
      snapshot({ health: { capture_status: 'degraded', packets_seen: 1, packets_dropped: 0, parse_errors: 0 } })
    );
    const withError = evaluateCloudRisk(
      snapshot({
        health: {
          capture_status: 'ok',
          packets_seen: 1,
          packets_dropped: 0,
          parse_errors: 0,
          last_error: 'pcap timeout',
        },
      })
    );

    expect(degraded.score).toBe(0.45);
    expect(degraded.band).toBe('medium');
    expect(degraded.alert?.severity).toBe('medium');
    expect(withError.score).toBe(0.45);
    expect(withError.signals).toContain('last_error');
  });

  it('escalona por puertos de riesgo (1 -> medio, 2+ -> alto)', () => {
    const one = evaluateCloudRisk(snapshot({ top_ports: [{ port: 3389, protocol: 'tcp', bytes: 100, connections: 2 }] }));
    const two = evaluateCloudRisk(
      snapshot({
        top_ports: [
          { port: 3389, protocol: 'tcp', bytes: 100, connections: 2 },
          { port: 6379, protocol: 'tcp', bytes: 50, connections: 1 },
        ],
      })
    );
    const benign = evaluateCloudRisk(
      snapshot({ top_ports: [{ port: 443, protocol: 'tcp', bytes: 1000, connections: 20 }] })
    );

    expect(one.score).toBe(0.5);
    expect(one.band).toBe('medium');
    expect(one.signals).toContain('risky_port:3389');
    expect(two.score).toBe(0.85);
    expect(two.band).toBe('high');
    expect(two.signals).toContain('risky_ports:3389,6379');
    expect(benign.score).toBe(0.1);
    expect(benign.alert).toBeNull();
  });

  it('detecta inundacion por ratio de paquetes caidos', () => {
    const result = evaluateCloudRisk(
      snapshot({
        health: { capture_status: 'ok', packets_seen: 100, packets_dropped: 60, parse_errors: 0 },
      })
    );

    expect(result.score).toBe(0.45);
    expect(result.signals).toContain('packet_drop');
    expect(result.alert?.severity).toBe('medium');
  });

  it('no marca inundacion si el volumen caido es marginal', () => {
    const result = evaluateCloudRisk(
      snapshot({
        health: { capture_status: 'ok', packets_seen: 100_000, packets_dropped: 30, parse_errors: 0 },
      })
    );

    expect(result.score).toBe(0.1);
    expect(result.signals).not.toContain('packet_drop');
  });

  it('gana la senal mas fuerte entre todas', () => {
    const result = evaluateCloudRisk(
      snapshot({
        health: { capture_status: 'degraded', packets_seen: 100, packets_dropped: 60, parse_errors: 0 },
        top_ports: [
          { port: 23, protocol: 'tcp', bytes: 10, connections: 1 },
          { port: 445, protocol: 'tcp', bytes: 10, connections: 1 },
        ],
      })
    );

    expect(result.score).toBe(0.85);
    expect(result.band).toBe('high');
    expect(result.alert?.severity).toBe('high');
  });

  it('la alerta cumple el contrato alert.v1', () => {
    const result = evaluateCloudRisk(
      snapshot({ top_ports: [{ port: 445, protocol: 'tcp', bytes: 10, connections: 1 }] })
    );

    expect(result.alert).not.toBeNull();
    const parsed = AlertSchema.safeParse(result.alert);
    expect(parsed.success).toBe(true);
    expect(result.alert?.evidence?.source).toBe('cloud_heuristic_v1');
    expect(result.alert?.evidence?.signals).toBe('risky_port:445');
  });
});

describe('resolveHostRiskScore', () => {
  it('conserva el score del agente cuando existe', () => {
    expect(resolveHostRiskScore(0.9, 0.1)).toBe(0.9);
    expect(resolveHostRiskScore(0.4, 0.85)).toBe(0.4);
  });

  it('rellena con el score de la ventana cuando el agente no envio score', () => {
    expect(resolveHostRiskScore(null, 0.5)).toBe(0.5);
    expect(resolveHostRiskScore(undefined, 0.5)).toBe(0.5);
    // risk_score 0 del agente se trata como "sin evaluar" (Opción B).
    expect(resolveHostRiskScore(0, 0.5)).toBe(0.5);
  });
});

describe('riskBandOf', () => {
  it('respeta los umbrales del dashboard', () => {
    expect(riskBandOf(0.7)).toBe('high');
    expect(riskBandOf(0.69)).toBe('medium');
    expect(riskBandOf(0.4)).toBe('medium');
    expect(riskBandOf(0.39)).toBe('low');
    expect(riskBandOf(0)).toBe('low');
  });
});
