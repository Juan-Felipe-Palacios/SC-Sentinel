// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Fija el comportamiento del upsert de ot_assets: statements idempotentes,
// contador seen_windows no se incrementa en reintento.

import { describe, expect, it } from 'vitest';
import {
  buildUpsertOtAssetsStatements,
  shouldUpsert,
  type SqlTag,
  type UpsertOtAssetsInput,
} from '../upsert';

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

function baseInput(overrides: Partial<UpsertOtAssetsInput> = {}): UpsertOtAssetsInput {
  return {
    deviceId: 'dev_1',
    windowEnd: new Date('2026-11-12T20:00:30.000Z'),
    assets: [
      {
        deviceId: 'dev_1',
        hostKey: 'hostkey1234567890abcdef',
        windowEnd: new Date('2026-11-12T20:00:30.000Z'),
        role: 'server',
        protocols: ['modbus'],
        peers: [],
        riskFlags: [],
      },
    ],
    ...overrides,
  };
}

describe('shouldUpsert', () => {
  it('retorna true si no existe fila (existingLastSeen = null)', () => {
    const windowEnd = new Date('2026-11-12T20:00:30.000Z');
    expect(shouldUpsert(null, windowEnd)).toBe(true);
  });

  it('retorna false si last_seen ya es windowEnd (reintento idempotente)', () => {
    const windowEnd = new Date('2026-11-12T20:00:30.000Z');
    expect(shouldUpsert(windowEnd, windowEnd)).toBe(false);
  });

  it('retorna true si last_seen es anterior a windowEnd (ventana nueva)', () => {
    const lastSeen = new Date('2026-11-12T19:59:30.000Z');
    const windowEnd = new Date('2026-11-12T20:00:30.000Z');
    expect(shouldUpsert(lastSeen, windowEnd)).toBe(true);
  });
});

describe('buildUpsertOtAssetsStatements', () => {
  it('emite un statement por asset', () => {
    const { sql, captured } = fakeSql();
    const statements = buildUpsertOtAssetsStatements(sql, baseInput());

    expect(statements).toHaveLength(1);
    expect(captured[0].text).toContain('INSERT INTO ot_assets');
    expect(captured[0].text).toContain('ON CONFLICT (device_id, host_key) DO UPDATE SET');
  });

  it('el WHERE previene incremento de seen_windows en reintento', () => {
    const { sql, captured } = fakeSql();
    buildUpsertOtAssetsStatements(sql, baseInput());

    expect(captured[0].text).toContain('WHERE ot_assets.last_seen < EXCLUDED.last_seen');
  });

  it('emite N statements para N assets', () => {
    const { sql, captured } = fakeSql();
    const input = baseInput({
      assets: [
        {
          deviceId: 'dev_1',
          hostKey: 'hostkey1',
          windowEnd: new Date('2026-11-12T20:00:30.000Z'),
          role: 'server',
          protocols: ['modbus'],
        },
        {
          deviceId: 'dev_1',
          hostKey: 'hostkey2',
          windowEnd: new Date('2026-11-12T20:00:30.000Z'),
          role: 'client',
          protocols: ['s7comm'],
        },
      ],
    });
    const statements = buildUpsertOtAssetsStatements(sql, input);

    expect(statements).toHaveLength(2);
    expect(captured[0].text).toContain('INSERT INTO ot_assets');
    expect(captured[1].text).toContain('INSERT INTO ot_assets');
  });

  it('reaplicar la misma ventana no incrementa seen_windows (idempotencia)', () => {
    // El WHERE ot_assets.last_seen < EXCLUDED.last_seen previene el incremento.
    // Si last_seen ya es windowEnd, la condición es falsa y DO UPDATE no se ejecuta.
    const { sql, captured } = fakeSql();
    buildUpsertOtAssetsStatements(sql, baseInput());

    expect(captured[0].text).toContain('seen_windows = ot_assets.seen_windows + 1');
    expect(captured[0].text).toContain('WHERE ot_assets.last_seen < EXCLUDED.last_seen');
  });
});