// web/lib/export/__tests__/csv.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { alertsToCsv, escapeCsvCell, hostsToCsv, sanitizeCsvFormula } from '@/lib/export/csv';
import type { HostMetricItem } from '@/lib/query/hosts';

describe('sanitizeCsvFormula', () => {
  it('antepone comilla simple a fórmulas peligrosas', () => {
    expect(sanitizeCsvFormula("=CMD('calc')")).toBe("'=CMD('calc')");
    expect(sanitizeCsvFormula('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
    expect(sanitizeCsvFormula('-2+3')).toBe("'-2+3");
    expect(sanitizeCsvFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(sanitizeCsvFormula('  =HYPERLINK("x")')).toBe("'  =HYPERLINK(\"x\")");
  });
  it('deja celdas normales intactas', () => {
    expect(sanitizeCsvFormula('plain')).toBe('plain');
    expect(sanitizeCsvFormula('192.168.0.1')).toBe('192.168.0.1');
  });
});

describe('escapeCsvCell', () => {
  it('envuelve en comillas y duplica comillas internas', () => {
    expect(escapeCsvCell('a"b,c\nd')).toBe('"a""b,c\nd"');
  });
  it('convierte null y undefined en celda vacía', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('hostsToCsv', () => {
  const hosts: HostMetricItem[] = [
    { host_key: 'hk_1', ip: '10.0.0.5', country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: '2026-01-01T00:00:00.000Z', last_seen: '2026-01-01T01:00:00.000Z' },
  ];
  it('emite encabezado y una fila por host', () => {
    const lines = hostsToCsv(hosts).trim().split('\n');
    expect(lines[0]).toBe('host_key,ip,country,bytes_in,bytes_out,packets,risk_score,first_seen,last_seen');
    expect(lines).toHaveLength(2);
  });
  it('emite solo el encabezado con lista vacía', () => {
    expect(hostsToCsv([]).trim().split('\n')).toHaveLength(1);
  });
});

describe('alertsToCsv', () => {
  it('sanitiza títulos que parecen fórmulas', () => {
    const csv = alertsToCsv([{ id: 'a1', window_id: 'w1', rule_id: 'r1', severity: 'high', title: '=CMD(\'calc\')', description: null, evidence: null, created_at: '2026-01-01T00:00:00.000Z' }]);
    expect(csv).toContain("'=CMD('calc')");
  });
});
