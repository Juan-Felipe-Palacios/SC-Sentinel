import { describe, expect, it } from 'vitest';
import type { ChatContext } from '../types';
import { extractIpv4, extractIpv6, validateChatAnswer } from '../validator';

const context: ChatContext = {
  period: { start: '2026-11-05T12:00:00.000Z', end: '2026-11-06T12:00:00.000Z' },
  totals: { bytes: 2_200_000, packets: 1_000, windows: 10, alerts: 1 },
  topHosts: [
    {
      hostKey: 'a9efcade46edf353dd05f7b2ca6cb647',
      ip: '203.0.113.9',
      country: 'AR',
      bytes: 2_160_000,
      packets: 900,
    },
    {
      hostKey: 'ipv6-host',
      ip: '2001:db8::1',
      country: 'AR',
      bytes: 40_000,
      packets: 100,
    },
  ],
  topPorts: [{ port: 443, protocol: 'tcp', bytes: 2_000_000, connections: 50 }],
  topCountries: [{ country: 'AR', bytes: 2_160_000, hosts: 1 }],
  alerts: [
    {
      id: 'alt_1',
      ruleId: 'traffic_concentration',
      severity: 'high',
      title: 'Concentración de tráfico',
      description: 'El host 203.0.113.9 concentra el 98% del tráfico.',
      createdAt: '2026-11-06T11:00:00.000Z',
    },
  ],
  health: {
    captureStatus: 'ok',
    packetsSeen: 1_000,
    packetsDropped: 0,
    parseErrors: 0,
    queueDepth: 0,
    spoolBytes: 0,
    recordedAt: '2026-11-06T11:59:00.000Z',
  },
};

describe('extractIpv4', () => {
  it('extrae solo IPv4 válidas, únicas y en orden', () => {
    expect(
      extractIpv4('203.0.113.9, 203.0.113.9, 999.1.1.1, 198.51.100.7 y 1.2.3')
    ).toEqual(['203.0.113.9', '198.51.100.7']);
  });
});

describe('extractIpv6', () => {
  it('extrae solo IPv6 válidas y no confunde horas con direcciones', () => {
    expect(
      extractIpv6('2001:db8::1, 2001:db8::1, ::1, 12:00:00 y 2001:db8::2')
    ).toEqual(['2001:db8::1', '::1', '2001:db8::2']);
  });
});

describe('validateChatAnswer', () => {
  it('acepta IPs que existen en el contexto (hosts o alertas)', () => {
    const result = validateChatAnswer(
      'El host 203.0.113.9 concentra el tráfico y aparece en la alerta.',
      context
    );
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('marca como advertencia una IP inventada', () => {
    const result = validateChatAnswer(
      'El host 203.0.113.9 y también 198.51.100.7.',
      context
    );
    expect(result.ok).toBe(false);
    expect(result.unknownIps).toEqual(['198.51.100.7']);
    expect(result.warnings[0]).toContain('198.51.100.7');
  });

  it('acepta IPv6 presentes en el contexto y marca una IPv6 inventada', () => {
    const ok = validateChatAnswer('El host 2001:db8::1 es legítimo.', context);
    expect(ok.ok).toBe(true);

    const bad = validateChatAnswer('El host 2001:db8::99 no está en el contexto.', context);
    expect(bad.ok).toBe(false);
    expect(bad.unknownIps).toEqual(['2001:db8::99']);
  });

  it('no marca números de versión ni texto sin IPs', () => {
    const result = validateChatAnswer('La versión 1.2.3 no es una IP.', context);
    expect(result.ok).toBe(true);
    expect(result.unknownIps).toEqual([]);
  });
});
