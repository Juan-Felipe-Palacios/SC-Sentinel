// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Tests de la derivación del bloque `ot` (M6 E7): alertas con client/server,
// evidencia acotada, agregación de activos y lote de upsert en un solo statement.

import { describe, expect, it } from 'vitest';
import {
  alertsFromOtBlock,
  applyConfidenceCeiling,
  assetsFromOtBlock,
  COLLECTOR_CONFIDENCE_CEILING,
  normalizeEvidence,
} from '../from-snapshot';
import { buildOtAssetsUpsertStatement, type SqlTag } from '../upsert';
import { OtBlockSchema, WindowSnapshotSchema } from '@/lib/schemas/ingest';
import { buildPersistStatements } from '@/lib/ingest/persist';

const CLIENT = 'a'.repeat(32);
const SERVER = 'b'.repeat(32);

function block(overrides: Record<string, unknown> = {}) {
  return OtBlockSchema.parse({
    engine: 'sc-ot',
    capture_mode: 'live',
    truncated: false,
    events: [
      {
        rule: 'ot_new_master',
        host_key: CLIENT,
        protocol: 'modbus',
        confidence: 0.95,
        evidence: { fn_codes: '3,16', allowlist_version: 'v1' },
        client: CLIENT,
        server: SERVER,
      },
    ],
    protocols: [{ name: 'modbus', role: 'client', first_seen: 'x', last_seen: 'x' }],
    endpoints: [{ host_key: CLIENT, protocol: 'modbus', role: 'client', port: 502 }],
    ...overrides,
  });
}

describe('normalizeEvidence', () => {
  it('convierte arrays a CSV, números a decimal y ordena las claves', () => {
    const out = normalizeEvidence({ fn_codes: ['3', '16'], confidence: 0.95, b: 'x' });
    expect(out).toEqual({ b: 'x', confidence: '0.95', fn_codes: '3,16' });
  });

  it('recorta valores a 128 chars y omite null/undefined', () => {
    const out = normalizeEvidence({ largo: 'z'.repeat(200), nulo: null, indefinido: undefined });
    expect(out.largo).toHaveLength(128);
    expect(Object.keys(out)).toEqual(['largo']);
  });

  it('corta en 32 claves', () => {
    const raw: Record<string, string> = {};
    for (let i = 0; i < 40; i += 1) raw[`k${String(i).padStart(2, '0')}`] = 'v';
    expect(Object.keys(normalizeEvidence(raw))).toHaveLength(32);
  });
});

describe('alertsFromOtBlock', () => {
  it('conserva client y server en evidence para las aristas de E8.1', () => {
    const [alert] = alertsFromOtBlock(block());
    expect(alert.rule_id).toBe('ot_new_master');
    expect(alert.severity).toBe('high');
    expect(alert.evidence.client).toBe(CLIENT);
    expect(alert.evidence.server).toBe(SERVER);
    expect(alert.evidence.fn_codes).toBe('3,16');
    expect(alert.evidence.confidence).toBe('0.95');
  });

  it('no recorta client/server aunque la evidencia tenga 32 claves', () => {
    // El contrato admite hasta 32 claves: se llena el tope para comprobar que
    // client/server sobreviven sin pasarse de 32.
    const evidence: Record<string, string> = {};
    for (let i = 0; i < 32; i += 1) evidence[`aa${String(i).padStart(2, '0')}`] = 'v';
    const [alert] = alertsFromOtBlock(block({
      events: [
        {
          rule: 'ot_new_master',
          host_key: CLIENT,
          protocol: 'modbus',
          confidence: 0.95,
          evidence,
          client: CLIENT,
          server: SERVER,
        },
      ],
    }));
    expect(alert.evidence.client).toBe(CLIENT);
    expect(alert.evidence.server).toBe(SERVER);
    expect(Object.keys(alert.evidence).length).toBeLessThanOrEqual(32);
  });

  it('da títulos distintos a pares distintos de la misma regla (no colapsan en el feed)', () => {
    const other = 'c'.repeat(32);
    const alerts = alertsFromOtBlock(block({
      events: [
        {
          rule: 'ot_new_master',
          host_key: CLIENT,
          protocol: 'modbus',
          confidence: 0.95,
          evidence: { fn_codes: '3' },
          client: CLIENT,
          server: SERVER,
        },
        {
          rule: 'ot_new_master',
          host_key: other,
          protocol: 'modbus',
          confidence: 0.95,
          evidence: { fn_codes: '3' },
          client: other,
          server: SERVER,
        },
      ],
    }));
    expect(alerts).toHaveLength(2);
    expect(alerts[0].title).not.toBe(alerts[1].title);
  });
});

describe('assetsFromOtBlock', () => {
  it('agrega por host, une roles client+server en both y ordena peers', () => {
    const assets = assetsFromOtBlock(block({
      endpoints: [
        { host_key: SERVER, protocol: 'modbus', role: 'server', port: 502 },
        { host_key: CLIENT, protocol: 'modbus', role: 'client', port: 502 },
        { host_key: CLIENT, protocol: 's7comm', role: 'server', port: 102 },
      ],
    }));
    expect(assets.map((a) => a.hostKey)).toEqual([CLIENT, SERVER]);
    const client = assets[0];
    expect(client.role).toBe('both');
    expect(client.protocols).toEqual(['modbus', 's7comm']);
    expect(client.peers).toEqual([SERVER]);
    expect(assets[1].role).toBe('server');
  });

  it('sin events ni endpoints devuelve lista vacía', () => {
    expect(assetsFromOtBlock(block({ events: [], endpoints: [], protocols: [] }))).toEqual([]);
  });
});

describe('buildOtAssetsUpsertStatement', () => {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return { text: strings.join('?'), values };
  }) as unknown as SqlTag;

  it('emite UN statement para varios activos con la guarda de seen_windows', () => {
    calls.length = 0;
    const statement = buildOtAssetsUpsertStatement(sql, {
      deviceId: 'dev_1',
      windowEnd: new Date('2026-11-26T10:00:00.000Z'),
      assets: [
        { hostKey: CLIENT, role: 'client', protocols: ['modbus'], peers: [SERVER] },
        { hostKey: SERVER, role: 'server', protocols: ['modbus'], peers: [CLIENT] },
      ],
    }) as { text: string; values: unknown[] };

    expect(calls).toHaveLength(1);
    expect(statement.text.match(/INSERT INTO ot_assets/g)).toHaveLength(1);
    expect(statement.text).toContain('ON CONFLICT (device_id, host_key) DO UPDATE');
    expect(statement.text).toContain('WHERE ot_assets.last_seen < EXCLUDED.last_seen');
    expect(statement.text.match(/::timestamptz/g)).toHaveLength(4);
    expect(statement.values).toContain('dev_1');
    expect(statement.values).toContain(CLIENT);
    expect(statement.values).toContain(SERVER);
  });

  it('sin activos no genera statement', () => {
    calls.length = 0;
    expect(
      buildOtAssetsUpsertStatement(sql, {
        deviceId: 'dev_1',
        windowEnd: new Date('2026-11-26T10:00:00.000Z'),
        assets: [],
      })
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('dos pasadas del contrato (E7)', () => {
  const snapshot = (ot: unknown) => ({
    top_hosts: [],
    top_ports: [],
    top_countries: [],
    alerts: [],
    health: { capture_status: 'ok', packets_seen: 0, packets_dropped: 0, parse_errors: 0 },
    ot,
  });

  it('un `ot` malformado no invalida la ventana: el core lo acepta', () => {
    expect(WindowSnapshotSchema.safeParse(snapshot({ engine: '' })).success).toBe(true);
  });

  it('la segunda pasada (OtBlockSchema) sí lo rechaza con ruta útil', () => {
    const parsed = OtBlockSchema.safeParse({ engine: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toContain('engine');
  });
});

describe('presupuesto de statements (criterio ≤3 extra de E7)', () => {
  const sql = ((strings: TemplateStringsArray) => ({ text: strings.join('?') })) as unknown as SqlTag;
  const base = {
    deviceId: 'dev_1',
    windowId: 'win_1',
    payloadHash: 'h',
    start: new Date('2026-11-26T09:55:00.000Z'),
    end: new Date('2026-11-26T10:00:00.000Z'),
    sequence: 12,
    snapshot: {},
    hostStats: [],
    alerts: [],
    health: {
      captureStatus: 'ok',
      packetsSeen: 0,
      packetsDropped: 0,
      parseErrors: 0,
      queueDepth: null,
      spoolBytes: null,
      collectorPacketsReceived: null,
      collectorPacketsDropped: null,
      collectorParseErrors: null,
      collectorTemplatesCached: null,
      collectorFlowsNormalized: null,
      lastError: null,
    },
    promoteToActive: false,
  };

  it('agrega UN solo statement sin importar cuántos activos OT haya', () => {
    const without = buildPersistStatements(sql, base);
    const withOt = buildPersistStatements(sql, {
      ...base,
      otAssets: assetsFromOtBlock(block({
        endpoints: [
          { host_key: CLIENT, protocol: 'modbus', role: 'client', port: 502 },
          { host_key: SERVER, protocol: 'modbus', role: 'server', port: 502 },
          { host_key: 'd'.repeat(32), protocol: 's7comm', role: 'client', port: 102 },
        ],
      })),
    });
    expect(withOt.length - without.length).toBe(1);
    expect(withOt.length - without.length).toBeLessThanOrEqual(3);
  });
});

describe('techo de confianza (E7, opción a)', () => {
  const offline = () => block({ capture_mode: 'offline' });

  it('degrada confirmed → 0.7 en captura offline y deja rastro en la evidencia', () => {
    const { block: capped, downgraded } = applyConfidenceCeiling(offline());
    expect(downgraded).toBe(1);
    expect(capped.events[0].confidence).toBe(COLLECTOR_CONFIDENCE_CEILING);
    expect(capped.events[0].evidence.confidence_ceiling).toBe('hint:offline:0.7');
  });

  it('no toca live', () => {
    const live = block();
    const { block: capped, downgraded } = applyConfidenceCeiling(live);
    expect(downgraded).toBe(0);
    expect(capped).toBe(live);
    expect(capped.events[0].confidence).toBe(0.95);
  });

  it('no toca eventos por debajo del umbral confirmed', () => {
    const low = block({
      capture_mode: 'offline',
      events: [
        {
          rule: 'ot_new_master',
          host_key: CLIENT,
          protocol: 'modbus',
          confidence: 0.5,
          evidence: { fn_codes: '3' },
          client: CLIENT,
          server: SERVER,
        },
      ],
    });
    const { block: capped, downgraded } = applyConfidenceCeiling(low);
    expect(downgraded).toBe(0);
    expect(capped).toBe(low);
    expect(capped.events[0].confidence).toBe(0.5);
  });

  it('la alerta derivada ya lleva la confianza degradada', () => {
    const { block: capped } = applyConfidenceCeiling(offline());
    const [alert] = alertsFromOtBlock(capped);
    expect(alert.evidence.confidence).toBe('0.7');
  });
});
