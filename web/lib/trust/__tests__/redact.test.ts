// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import type { AiInsightRecord } from '@/lib/ai/analyze';
import type { AlertItem } from '@/lib/query/alerts';
import type { HostMetricItem } from '@/lib/query/hosts';
import { redactIpv4, redactTrustAlert, redactTrustHost, redactTrustInsight } from '../redact';

const host: HostMetricItem = {
  host_key: '203.0.113.7',
  ip: '203.0.113.7',
  country: 'AR',
  bytes_in: 100,
  bytes_out: 200,
  packets: 3,
  risk_score: 10,
  first_seen: '2026-11-09T00:00:00.000Z',
  last_seen: '2026-11-09T01:00:00.000Z',
};

const alert: AlertItem = {
  id: 'alt_1',
  window_id: 'win_1',
  rule_id: 'dns_tunnel',
  severity: 'high',
  title: 'Posible túnel desde 203.0.113.7',
  description: 'El host 203.0.113.7 consultó dominios sospechosos',
  evidence: { src_ip: '203.0.113.7' },
  created_at: '2026-11-09T00:00:00.000Z',
  status: 'open',
  assignee: null,
  assignee_operator_id: null,
  acknowledged_at: null,
  resolved_at: null,
  sla_due_at: '2026-11-11T12:00:00.000Z',
  expires_at: '2026-11-18T11:00:00.000Z',
  sla_breached: false,
  sla_remaining_seconds: 3600,
  updated_at: '2026-11-09T00:00:00.000Z',
  notes_count: 0,
};

const insight: AiInsightRecord = {
  id: 'ain_1',
  device_id: 'dev_real',
  period_start: '2026-11-09T00:00:00.000Z',
  period_end: '2026-11-09T01:00:00.000Z',
  model: 'gemini-2.5-flash',
  status: 'ok',
  language: 'es',
  risk_level: 'high',
  summary: 'El host 203.0.113.7 generó tráfico anómalo.',
  findings: [{ type: 'dns', description: 'Consultas desde 203.0.113.7', severity: 'high' }],
  recommendations: ['Revisar 203.0.113.7'],
  facts_hash: 'hash_interno',
  created_at: '2026-11-09T01:00:00.000Z',
};

describe('redacción de Trust Pages', () => {
  it('sustituye IPv4 embebidas en texto libre', () => {
    expect(redactIpv4('origen 203.0.113.7 y 10.0.0.1')).toBe(
      'origen •••.•••.•••.••• y •••.•••.•••.•••'
    );
  });

  it('elimina la IP del host y la redacta en la clave', () => {
    const result = redactTrustHost(host);

    expect(result.ip).toBeNull();
    expect(result.host_key).toBe('•••.•••.•••.•••');
    expect(result.country).toBe('AR');
  });

  it('elimina descripción y evidencia de las alertas', () => {
    const result = redactTrustAlert(alert);

    expect(result.description).toBeNull();
    expect(result.evidence).toBeNull();
    expect(result.title).toContain('•••.•••.•••.•••');
    expect(result.title).not.toContain('203.0.113.7');
  });

  it('elimina identificadores internos y redacta todo el texto del insight', () => {
    const result = redactTrustInsight(insight);

    expect(result).not.toBeNull();
    expect(result!.device_id).toBe('');
    expect(result!.facts_hash).toBe('');
    expect(result!.summary).not.toContain('203.0.113.7');
    expect(result!.findings[0].description).not.toContain('203.0.113.7');
    expect(result!.recommendations[0]).not.toContain('203.0.113.7');
    expect(result!.model).toBe('gemini-2.5-flash');
  });

  it('acepta un insight ausente', () => {
    expect(redactTrustInsight(null)).toBeNull();
  });
});
