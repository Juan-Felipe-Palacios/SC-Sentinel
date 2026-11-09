// web/lib/export/__tests__/xlsx.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { buildXlsxBufferMulti, rowsFromHosts, rowsFromWindows } from '@/lib/export/xlsx';
import * as XLSX from 'xlsx';

describe('buildXlsxBufferMulti', () => {
  it('genera un workbook con varias hojas legibles', () => {
    const buffer = buildXlsxBufferMulti({
      Overview: [{ metric: 'bytes_in', value: 1000 }],
      Hosts: rowsFromHosts([{ host_key: 'hk_1', ip: null, country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: null, last_seen: null }]),
      Windows: rowsFromWindows([{ window_id: 'w1', start_at: '2026-01-01T00:00:00.000Z', end_at: '2026-01-01T00:00:30.000Z', sequence: 1 }]),
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Overview', 'Hosts', 'Windows']);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['Hosts']!, { defval: null })).toEqual([
      { host_key: 'hk_1', ip: null, country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: null, last_seen: null },
    ]);
  });
});
