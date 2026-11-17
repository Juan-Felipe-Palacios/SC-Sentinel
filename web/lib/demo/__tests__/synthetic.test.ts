// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_DEMO_DEVICE_ID,
  isSyntheticDemoDevice,
  syntheticAlerts,
  syntheticHealth,
  syntheticHeatmap,
  syntheticHostDetail,
  syntheticHosts,
  syntheticInsight,
  syntheticOverview,
} from '@/lib/demo/synthetic';

const NOW = new Date('2026-11-17T03:00:00.000Z');

describe('dataset sintético de la demo', () => {
  it('usa un device reservado que no puede confundirse con uno real', () => {
    expect(SYNTHETIC_DEMO_DEVICE_ID).toBe('dev_demo_synthetic');
    expect(isSyntheticDemoDevice(SYNTHETIC_DEMO_DEVICE_ID)).toBe(true);
    expect(isSyntheticDemoDevice('dev_bee8a7f6-8191-47ef-9dc2-f1ef3a9d7636')).toBe(false);
  });

  it('genera el mismo resumen para el mismo rango y momento', () => {
    const first = syntheticOverview('1h', NOW);
    const second = syntheticOverview('1h', NOW);

    expect(second).toEqual(first);
    expect(first.totals.hosts_count).toBeGreaterThan(0);
    expect(first.totals.windows_count).toBe(120);
    expect(first.series.length).toBe(60);
    expect(first.last_data_at).toBe(NOW.toISOString());
  });

  it('mantiene coherencia entre resumen, hosts y drill-down', () => {
    const overview = syntheticOverview('1h', NOW);
    const hosts = syntheticHosts('1h', NOW);
    const detail = syntheticHostDetail(hosts.hosts[0].host_key, '1h', NOW);

    expect(hosts.total).toBe(overview.totals.hosts_count);
    expect(detail.host_key).toBe(hosts.hosts[0].host_key);
    expect(detail.totals.windows_count).toBeGreaterThan(0);
    expect(detail.series.length).toBeGreaterThan(0);
  });

  it('genera alertas, salud, heatmap e insight etiquetados como demo', () => {
    const alerts = syntheticAlerts('1h', NOW);
    const health = syntheticHealth(NOW);
    const heatmap = syntheticHeatmap('1h', NOW);
    const insight = syntheticInsight('es', NOW);

    expect(alerts.total).toBeGreaterThan(0);
    expect(alerts.alerts.every((alert) => alert.evidence?.demo === true)).toBe(true);
    expect(health.device_id).toBe(SYNTHETIC_DEMO_DEVICE_ID);
    expect(health.capture_status).toBe('ok');
    expect(heatmap.cells).toHaveLength(24);
    expect(heatmap.max).toBeGreaterThan(0);
    expect(insight.device_id).toBe(SYNTHETIC_DEMO_DEVICE_ID);
    expect(insight.summary).toMatch(/demostración/i);
    expect(insight.facts_hash).toBe('demo-synthetic');
  });
});
