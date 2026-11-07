import { describe, expect, it } from 'vitest';
import type { ChatContext } from '../types';
import {
  buildSuggestions,
  detectQueryType,
  isExportableQuery,
} from '../suggestions';

const emptyContext: ChatContext = {
  period: { start: '2026-11-05T12:00:00.000Z', end: '2026-11-06T12:00:00.000Z' },
  totals: { bytes: 0, packets: 0, windows: 0, alerts: 0 },
  topHosts: [],
  topPorts: [],
  topCountries: [],
  alerts: [],
  health: null,
};

const withData: ChatContext = {
  ...emptyContext,
  totals: { bytes: 1_000, packets: 10, windows: 1, alerts: 0 },
  topHosts: [
    { hostKey: 'host-a', ip: '203.0.113.9', country: 'AR', bytes: 1_000, packets: 10 },
  ],
};

describe('detectQueryType', () => {
  it('detecta alertas, hosts, tráfico y salud', () => {
    expect(detectQueryType('¿Qué alertas críticas hay?')).toBe('alerts');
    expect(detectQueryType('¿Qué IP domina el tráfico?')).toBe('hosts');
    expect(detectQueryType('Mostrame los bytes por puerto')).toBe('traffic');
    expect(detectQueryType('¿El agente está perdiendo paquetes?')).toBe('health');
    expect(detectQueryType('Hola')).toBe('general');
  });
});

describe('buildSuggestions', () => {
  it('devuelve como máximo 3 sugerencias', () => {
    expect(buildSuggestions('alerts', withData)).toHaveLength(3);
  });

  it('prioriza revisar la captura cuando no hay datos', () => {
    const suggestions = buildSuggestions('general', emptyContext);
    expect(suggestions[0]).toContain('no hay datos');
  });
});

describe('isExportableQuery', () => {
  it('reconoce reportes y exportaciones', () => {
    expect(isExportableQuery('Generá un reporte en PDF')).toBe(true);
    expect(isExportableQuery('Exportar a markdown')).toBe(true);
    expect(isExportableQuery('¿Qué hosts hay?')).toBe(false);
  });
});
