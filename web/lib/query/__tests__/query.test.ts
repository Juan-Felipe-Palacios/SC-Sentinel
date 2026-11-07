// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getRangeBounds } from '../range';
import { queryOverview } from '../overview';
import { queryHosts, HOSTS_LIMIT } from '../hosts';
import { queryAlerts, ALERTS_LIMIT } from '../alerts';
import { queryHealth } from '../health';
import { GET } from '@/app/api/query/route';

const fixedNow = new Date('2026-11-04T12:00:00.000Z');

function fakeDb(responses: unknown[][]) {
  const execute = vi.fn();
  for (const response of responses) execute.mockResolvedValueOnce(response);
  return { execute } as never;
}

describe('getRangeBounds', () => {
  it('7d bounds are exactly 7 days apart', () => {
    const { start, end } = getRangeBounds('7d', fixedNow);
    expect(end.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    expect(start.toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });

  it('1h bounds are exactly 1 hour apart', () => {
    const { start, end } = getRangeBounds('1h', fixedNow);
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
  });

  it('15m bounds are exactly 15 minutes apart', () => {
    const { start, end } = getRangeBounds('15m', fixedNow);
    expect(end.getTime() - start.getTime()).toBe(15 * 60 * 1000);
  });

  it('30d bounds are exactly 30 days apart', () => {
    const { start, end } = getRangeBounds('30d', fixedNow);
    expect(end.getTime() - start.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('queryOverview', () => {
  it('returns contract shape with host_stats-derived totals', async () => {
    const db = fakeDb([
      [{ windows_count: '12' }],
      [
        {
          bytes_in: '1000',
          bytes_out: '2500',
          packets: '77',
          hosts_count: '4',
          countries_count: '2',
        },
      ],
      [
        { bucket: '2026-11-04T11:30:00.000Z', bytes_in: '400', bytes_out: '500' },
        { bucket: '2026-11-04T11:31:00.000Z', bytes_in: '600', bytes_out: '2000' },
      ],
      [
        {
          host_key: 'host-a',
          ip: '203.0.113.7',
          country: 'AR',
          risk_score: '0.82',
          bytes_in: '700',
          bytes_out: '800',
          packets: '10',
        },
      ],
      [{ country: 'AR', bytes_total: '1500', hosts_count: '3' }],
      [{ alerts_count: '4' }],
      [
        { severity: 'critical', count: '1' },
        { severity: 'high', count: '2' },
        { severity: 'info', count: '1' },
      ],
      [
        { port: 443, protocol: 'tcp', bytes: '1200', connections: '8' },
        { port: 53, protocol: 'udp', bytes: '300', connections: '2' },
        { port: 22, protocol: 'tcp', bytes: '100', connections: '1' },
      ],
      [{ scored_hosts: '3', high_hosts: '1', medium_hosts: '1', low_hosts: '1', avg_score: '0.4833' }],
    ]);

    const result = await queryOverview('1h', 'dev_123', db, fixedNow);

    expect(result.range).toBe('1h');
    expect(result.period).toEqual({ start: '2026-11-04T11:00:00.000Z', end: '2026-11-04T12:00:00.000Z' });
    expect(result.totals).toEqual({
      bytes_in: 1000,
      bytes_out: 2500,
      packets_in: 77,
      packets_out: 77,
      windows_count: 12,
      alerts_count: 4,
      hosts_count: 4,
      countries_count: 2,
      alerts_by_severity: { critical: 1, high: 2, medium: 0, low: 0, info: 1 },
    });
    expect(result.series).toEqual([
      { timestamp: '2026-11-04T11:30:00.000Z', bytes_in: 400, bytes_out: 500 },
      { timestamp: '2026-11-04T11:31:00.000Z', bytes_in: 600, bytes_out: 2000 },
    ]);
    expect(result.top_hosts).toEqual([
      {
        host_key: 'host-a',
        ip: '203.0.113.7',
        country: 'AR',
        risk_score: 0.82,
        bytes_in: 700,
        bytes_out: 800,
        bytes_total: 1500,
        packets: 10,
      },
    ]);
    expect(result.top_countries).toEqual([{ country: 'AR', bytes_total: 1500, hosts_count: 3 }]);
    expect(result.top_ports).toEqual([
      { port: 443, protocol: 'tcp', bytes: 1200, connections: 8 },
      { port: 53, protocol: 'udp', bytes: 300, connections: 2 },
      { port: 22, protocol: 'tcp', bytes: 100, connections: 1 },
    ]);
    expect(result.protocols).toEqual([
      { protocol: 'tcp', bytes: 1300, connections: 9 },
      { protocol: 'udp', bytes: 300, connections: 2 },
    ]);
    expect(result.risk).toEqual({
      scored_hosts: 3,
      high_hosts: 1,
      medium_hosts: 1,
      low_hosts: 1,
      avg_score: 0.4833,
    });
  });

  it('reports empty risk when no host has a score', async () => {
    const db = fakeDb([
      [{ windows_count: '1' }],
      [{ bytes_in: '0', bytes_out: '0', packets: '0', hosts_count: '2', countries_count: '0' }],
      [],
      [],
      [],
      [{ alerts_count: '0' }],
      [],
      [],
      [{ scored_hosts: '0', high_hosts: '0', medium_hosts: '0', low_hosts: '0', avg_score: null }],
    ]);

    const result = await queryOverview('1h', 'dev_123', db, fixedNow);
    expect(result.risk).toEqual({
      scored_hosts: 0,
      high_hosts: 0,
      medium_hosts: 0,
      low_hosts: 0,
      avg_score: null,
    });
  });

  it('returns empty zeroed payload when device is unresolved and does not query DB', async () => {
    const db = { execute: vi.fn() };
    const result = await queryOverview('1h', null, db as never, fixedNow);
    expect(db.execute).not.toHaveBeenCalled();
    expect(result.totals.windows_count).toBe(0);
    expect(result.totals.alerts_by_severity).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
    expect(result.series).toEqual([]);
    expect(result.top_ports).toEqual([]);
    expect(result.risk).toEqual({
      scored_hosts: 0,
      high_hosts: 0,
      medium_hosts: 0,
      low_hosts: 0,
      avg_score: null,
    });
  });
});

describe('queryHosts', () => {
  it('maps rows and returns real distinct total, not page length', async () => {
    const db = fakeDb([
      [
        {
          host_key: 'host-a',
          country: 'AR',
          bytes_in: '100',
          bytes_out: '250',
          packets: '9',
          risk_score: '7.5',
          first_seen: '2026-11-04T10:00:00.000Z',
          last_seen: '2026-11-04T11:00:00.000Z',
        },
      ],
      [{ total: '42' }],
    ]);

    const result = await queryHosts('1h', 'dev_123', db, fixedNow);

    expect(HOSTS_LIMIT).toBe(50);
    expect(result.total).toBe(42);
    expect(result.hosts).toEqual([
      {
        host_key: 'host-a',
        ip: null,
        country: 'AR',
        bytes_in: 100,
        bytes_out: 250,
        packets: 9,
        risk_score: 7.5,
        first_seen: '2026-11-04T10:00:00.000Z',
        last_seen: '2026-11-04T11:00:00.000Z',
      },
    ]);
  });

  it('returns empty payload when device is unresolved', async () => {
    const result = await queryHosts('1h', null, { execute: vi.fn() } as never, fixedNow);
    expect(result).toEqual({ range: '1h', hosts: [], total: 0 });
  });
});

describe('queryAlerts', () => {
  it('maps alerts with created_at from window start and total from count query', async () => {
    const db = fakeDb([
      [
        {
          id: 'alert_1',
          window_id: 'win_1',
          rule_id: 'blacklist_hit',
          severity: 'critical',
          title: 'Blacklist hit',
          description: 'Domain matched blacklist',
          evidence: { domain_class: 'dns', query_count: '33' },
          created_at: '2026-11-04T11:00:00.000Z',
        },
      ],
      [{ total: '17' }],
    ]);

    const result = await queryAlerts('24h', 'dev_123', db, fixedNow);

    expect(ALERTS_LIMIT).toBe(100);
    expect(result.total).toBe(17);
    expect(result.alerts[0]).toMatchObject({
      id: 'alert_1',
      window_id: 'win_1',
      rule_id: 'blacklist_hit',
      created_at: '2026-11-04T11:00:00.000Z',
    });
    expect(result.alerts[0]?.evidence).toEqual({ domain_class: 'dns', query_count: '33' });
  });

  it('parses evidence when the driver returns a JSON string', async () => {
    const db = fakeDb([
      [
        {
          id: 'alert_2',
          window_id: 'win_2',
          rule_id: 'beacon',
          severity: 'high',
          title: 'Beaconing',
          description: null,
          evidence: '{"query_count":"12"}',
          created_at: '2026-11-04T11:05:00.000Z',
        },
      ],
      [{ total: '1' }],
    ]);

    const result = await queryAlerts('24h', 'dev_123', db, fixedNow);
    expect(result.alerts[0]?.evidence).toEqual({ query_count: '12' });
  });
});

describe('queryHealth', () => {
  it('maps latest agent_health row to contract fields', async () => {
    const db = fakeDb([
      [
        {
          device_id: 'dev_123',
          capture_status: 'degraded',
          packets_seen: '1000',
          packets_dropped: '12',
          parse_errors: '2',
          queue_depth: '5',
          spool_bytes: '4096',
          last_error: 'af_packet timeout',
          recorded_at: '2026-11-04T11:59:00.000Z',
        },
      ],
    ]);

    const result = await queryHealth('dev_123', db);
    expect(result).toEqual({
      device_id: 'dev_123',
      capture_status: 'degraded',
      packets_seen: 1000,
      packets_dropped: 12,
      parse_errors: 2,
      queue_depth: 5,
      spool_bytes: 4096,
      last_error: 'af_packet timeout',
      recorded_at: '2026-11-04T11:59:00.000Z',
    });
  });

  it('returns null health payload when no rows exist', async () => {
    const db = fakeDb([[]]);
    const result = await queryHealth('dev_123', db);
    expect(result).toEqual({
      device_id: 'dev_123',
      capture_status: null,
      packets_seen: 0,
      packets_dropped: 0,
      parse_errors: 0,
      queue_depth: null,
      spool_bytes: null,
      last_error: null,
      recorded_at: null,
    });
  });
});

describe('GET /api/query', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 in production when sc_session cookie is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const request = new NextRequest('http://localhost/api/query?metric=overview&range=1h');
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns 400 for an invalid metric in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const request = new NextRequest('http://localhost/api/query?metric=unknown');
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('bad_request');
  });

  it('returns 400 when metric is missing in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const request = new NextRequest('http://localhost/api/query?range=1h');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});
