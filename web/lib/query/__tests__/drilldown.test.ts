// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import { customBucketSeconds, getRangeBounds, resolveQueryBounds } from '../range';
import { buildHeatmap, HEATMAP_PORTS_LIMIT } from '../heatmap';
import { emptyHostDetail } from '../host-detail';

const fixedNow = new Date('2026-11-04T12:00:00.000Z');

describe('resolveQueryBounds', () => {
  it('sin start/end usa el rango nominal', () => {
    const result = resolveQueryBounds('24h', null, null, fixedNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bounds.end.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    expect(result.bounds.start.toISOString()).toBe('2026-11-03T12:00:00.000Z');
  });

  it('con start/end respeta la ventana exacta del zoom', () => {
    const result = resolveQueryBounds(
      '30d',
      '2026-11-04T05:00:00.000Z',
      '2026-11-04T06:00:00.000Z',
      fixedNow
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bounds.start.toISOString()).toBe('2026-11-04T05:00:00.000Z');
    expect(result.bounds.end.toISOString()).toBe('2026-11-04T06:00:00.000Z');
  });

  it('rechaza start sin end', () => {
    const result = resolveQueryBounds('1h', '2026-11-04T05:00:00.000Z', null, fixedNow);
    expect(result).toEqual({ ok: false, message: 'start y end van juntos' });
  });

  it('rechaza un fin anterior al inicio', () => {
    const result = resolveQueryBounds(
      '1h',
      '2026-11-04T06:00:00.000Z',
      '2026-11-04T05:00:00.000Z',
      fixedNow
    );
    expect(result.ok).toBe(false);
  });

  it('rechaza fechas inválidas', () => {
    const result = resolveQueryBounds('1h', 'ayer', 'hoy', fixedNow);
    expect(result.ok).toBe(false);
  });

  it('rechaza ventanas de más de 31 días', () => {
    const result = resolveQueryBounds(
      '30d',
      '2026-01-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
      fixedNow
    );
    expect(result.ok).toBe(false);
  });
});

describe('customBucketSeconds', () => {
  it('mantiene buckets finos para ventanas cortas', () => {
    expect(customBucketSeconds({ start: new Date('2026-11-04T11:00:00Z'), end: new Date('2026-11-04T11:30:00Z') })).toBe(30);
  });

  it('agrupa por hora en ventanas de varios días', () => {
    expect(customBucketSeconds({ start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-11-05T00:00:00Z') })).toBe(3600);
  });

  it('usa el bucket más grueso por encima de una semana', () => {
    expect(customBucketSeconds({ start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-25T00:00:00Z') })).toBe(7200);
  });
});

describe('buildHeatmap', () => {
  const bounds = getRangeBounds('24h', fixedNow);

  it('arma 24 filas con una columna por puerto y ordena por bytes', () => {
    const result = buildHeatmap(
      [
        { hour_of_day: 3, port: 443, protocol: 'tcp', bytes: '100' },
        { hour_of_day: 3, port: 53, protocol: 'udp', bytes: '900' },
        { hour_of_day: 5, port: 443, protocol: 'tcp', bytes: '50' },
      ],
      '24h',
      bounds
    );

    expect(result.hours).toHaveLength(24);
    expect(result.ports.map((port) => port.port)).toEqual([53, 443]);
    expect(result.ports[1].bytes).toBe(150);
    expect(result.cells[3]).toEqual([900, 100]);
    expect(result.cells[5]).toEqual([0, 50]);
    expect(result.max).toBe(900);
    expect(result.total_bytes).toBe(1050);
  });

  it('suma la misma hora/puerto sin duplicar columnas', () => {
    const result = buildHeatmap(
      [
        { hour_of_day: 7, port: 80, protocol: 'tcp', bytes: '10' },
        { hour_of_day: 7, port: 80, protocol: 'TCP', bytes: '15' },
      ],
      '24h',
      bounds
    );
    expect(result.ports).toHaveLength(1);
    expect(result.cells[7]).toEqual([25]);
  });

  it('descarta filas fuera de rango y limita las columnas', () => {
    const rows = Array.from({ length: HEATMAP_PORTS_LIMIT + 4 }, (_, i) => ({
      hour_of_day: 1,
      port: 1000 + i,
      protocol: 'tcp',
      bytes: String(1000 - i),
    }));
    rows.push({ hour_of_day: 99, port: 443, protocol: 'tcp', bytes: '5' });

    const result = buildHeatmap(rows, '24h', bounds);
    expect(result.ports).toHaveLength(HEATMAP_PORTS_LIMIT);
    expect(result.ports[0].port).toBe(1000);
    expect(result.cells.every((row) => row.length === HEATMAP_PORTS_LIMIT)).toBe(true);
  });

  it('sin datos devuelve una matriz vacía coherente', () => {
    const result = buildHeatmap([], '24h', bounds);
    expect(result.ports).toEqual([]);
    expect(result.max).toBe(0);
    expect(result.cells).toHaveLength(24);
  });
});

describe('emptyHostDetail', () => {
  it('incluye el período consultado y totales en cero', () => {
    const bounds = getRangeBounds('1h', fixedNow);
    const result = emptyHostDetail('host-a', '1h', bounds);
    expect(result.host_key).toBe('host-a');
    expect(result.series).toEqual([]);
    expect(result.totals.windows_count).toBe(0);
    expect(result.period.start).toBe('2026-11-04T11:00:00.000Z');
  });
});
