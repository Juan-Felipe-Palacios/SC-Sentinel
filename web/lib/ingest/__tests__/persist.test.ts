// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Fija el comportamiento del que dependen el route y el agente: una sola
// transacción, ids deterministas y replay idempotente (ADR-0015).

import { describe, expect, it } from 'vitest';
import { buildPersistStatements, stableId, type PersistInput, type SqlTag } from '../persist';

interface Captured {
  text: string;
  values: unknown[];
}

function fakeSql() {
  const captured: Captured[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = { text: strings.join('?').replace(/\s+/g, ' ').trim(), values };
    captured.push(statement);
    return statement;
  }) as unknown as SqlTag;
  return { sql, captured };
}

function baseInput(overrides: Partial<PersistInput> = {}): PersistInput {
  return {
    deviceId: 'dev_1',
    windowId: 'win_1',
    payloadHash: 'a'.repeat(64),
    start: new Date('2026-11-12T20:00:00.000Z'),
    end: new Date('2026-11-12T20:00:30.000Z'),
    sequence: 7,
    snapshot: { top_hosts: [] },
    hostStats: [],
    alerts: [],
    health: {
      captureStatus: 'running',
      packetsSeen: 10,
      packetsDropped: 0,
      parseErrors: 0,
      queueDepth: 1,
      spoolBytes: 0,
      collectorPacketsReceived: 10,
      collectorPacketsDropped: 0,
      collectorParseErrors: 0,
      collectorTemplatesCached: 3,
      collectorFlowsNormalized: 4,
      lastError: null,
    },
    promoteToActive: false,
    ...overrides,
  };
}

describe('buildPersistStatements', () => {
  it('emite batch, ventana, agent_health y devices en una sola lista', () => {
    const { sql, captured } = fakeSql();
    const statements = buildPersistStatements(sql, baseInput());

    expect(statements).toHaveLength(4);
    expect(captured[0].text).toContain('INSERT INTO ingest_batches');
    expect(captured[0].text).toContain('ON CONFLICT DO NOTHING');
    // El route decide `processed` vs `duplicate` con el RETURNING del batch.
    expect(captured[0].text).toContain('RETURNING id');
    expect(captured[1].text).toContain('INSERT INTO flow_windows');
    // agent_health siempre se escribe: era el insert que fallaba y dejaba la
    // ventana huérfana con un 500 en cada intento.
    expect(captured[2].text).toContain('INSERT INTO agent_health');
    expect(captured[3].text).toContain('UPDATE devices SET last_seen_at = now()');
    expect(captured[3].text).not.toContain('status');
  });

  it('promueve el device a active solo en el primer ingest', () => {
    const { sql, captured } = fakeSql();
    buildPersistStatements(sql, baseInput({ promoteToActive: true }));
    expect(captured.at(-1)?.text).toContain("status = 'active'");
  });

  it('usa ids deterministas: la misma ventana reenviada es un no-op', () => {
    const first = fakeSql();
    const second = fakeSql();
    buildPersistStatements(first.sql, baseInput());
    buildPersistStatements(second.sql, baseInput());

    expect(first.captured.map((s) => s.text)).toEqual(second.captured.map((s) => s.text));
    expect(first.captured.map((s) => s.values)).toEqual(second.captured.map((s) => s.values));
    expect(first.captured[0].values[0]).toBe(stableId('bat', 'dev_1', 'win_1'));
  });

  it('incluye host_stats y alerts con ids estables y plazos de SLA', () => {
    const { sql, captured } = fakeSql();
    buildPersistStatements(
      sql,
      baseInput({
        hostStats: [
          {
            hostKey: 'api.ejemplo.com',
            ipDisplay: null,
            bytesIn: 100,
            bytesOut: 200,
            packets: 3,
            country: 'ES',
            riskScore: 42,
          },
        ],
        alerts: [
          {
            ruleId: 'cloud_heuristic',
            severity: 'high',
            title: 'Riesgo alto',
            description: 'muchos SYNs',
            evidence: { score: 80 },
          },
        ],
      })
    );

    const hostInsert = captured.find((s) => s.text.includes('INSERT INTO host_stats'));
    expect(hostInsert?.values[0]).toBe(stableId('hst', 'win_1', 'api.ejemplo.com', ''));

    const alertInsert = captured.find((s) => s.text.includes('INSERT INTO alerts'));
    expect(alertInsert?.values[0]).toBe(stableId('alt', 'win_1', 'cloud_heuristic', 'Riesgo alto'));
    // SLA desde el inicio de la ventana: 4 h para severidad high.
    expect(alertInsert?.values).toContain(new Date('2026-11-13T00:00:00.000Z').toISOString());
    expect(alertInsert?.text).toContain('ON CONFLICT DO NOTHING');
  });
});
