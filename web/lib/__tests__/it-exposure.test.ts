// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import {
  IT_EXPOSURE_COUNTRY_CAP,
  IT_EXPOSURE_HOST_CAP,
  IT_EXPOSURE_PORT_CAP,
  buildItExposure,
} from '@/lib/it-exposure';
import type { OverviewTopCountry, OverviewTopHost, OverviewTopPort } from '@/lib/api-types';

function host(
  key: string,
  country: string | null,
  bytes: number,
  extra: Partial<OverviewTopHost> = {}
): OverviewTopHost {
  return {
    host_key: key,
    ip: null,
    hostname: null,
    country,
    risk_score: null,
    bytes_in: bytes,
    bytes_out: 0,
    bytes_total: bytes,
    packets: bytes,
    ...extra,
  };
}

function country(name: string, bytes: number, hosts: number): OverviewTopCountry {
  return { country: name, bytes_total: bytes, hosts_count: hosts };
}

function port(port: number, protocol: string, bytes: number, connections: number): OverviewTopPort {
  return { port, protocol, bytes, connections };
}

describe('buildItExposure', () => {
  it('agrupa por país, ordena por bytes y cae a hostname → IP → host_key', () => {
    const layout = buildItExposure(
      [
        host('aaaa000000000001', 'Argentina', 100, { hostname: 'web-01' }),
        host('aaaa000000000002', 'Argentina', 300),
        host('aaaa000000000003', 'Chile', 900, { ip: '200.1.2.3' }),
      ],
      [country('Chile', 900, 1), country('Argentina', 400, 2)],
      []
    );

    expect(layout.groups.map((g) => g.country)).toEqual(['Chile', 'Argentina']);
    expect(layout.groups[1].hosts.map((h) => h.label)).toEqual([
      'aaaa000000000002',
      'web-01',
    ]);
    expect(layout.groups[0].hosts[0].label).toBe('200.1.2.3');
    expect(layout.truncated).toBe(false);
  });

  it('agrupa los hosts sin país en «Sin país»', () => {
    const layout = buildItExposure([host('bbbb000000000001', null, 10)], [], []);
    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].country).toBe('Sin país');
  });

  it('acota los países a 6, marcando truncated', () => {
    const hosts: OverviewTopHost[] = [];
    const countries: OverviewTopCountry[] = [];
    for (let c = 0; c < IT_EXPOSURE_COUNTRY_CAP + 2; c += 1) {
      const name = `P${c}`;
      countries.push(country(name, 1000 - c, 1));
      hosts.push(host(`cccc${c}000000000000`, name, 500 - c));
    }

    const layout = buildItExposure(hosts, countries, []);

    expect(layout.groups).toHaveLength(IT_EXPOSURE_COUNTRY_CAP);
    expect(layout.groups.reduce((n, g) => n + g.hosts.length, 0)).toBe(IT_EXPOSURE_COUNTRY_CAP);
    expect(layout.truncated).toBe(true);
  });

  it('acota los hosts a 12 en total, marcando truncated', () => {
    const hosts: OverviewTopHost[] = [];
    const countries: OverviewTopCountry[] = [];
    for (let c = 0; c < 3; c += 1) {
      const name = `Q${c}`;
      countries.push(country(name, 900 - c, 5));
      for (let h = 0; h < 5; h += 1) {
        hosts.push(host(`dddd${c}${h}000000000000`, name, 400 - h));
      }
    }

    const layout = buildItExposure(hosts, countries, []);

    expect(layout.groups.reduce((n, g) => n + g.hosts.length, 0)).toBe(IT_EXPOSURE_HOST_CAP);
    expect(layout.truncated).toBe(true);
  });

  it('toma los puertos por bytes y marca truncated cuando sobran', () => {
    const ports = [
      port(443, 'TCP', 10, 1),
      port(80, 'TCP', 900, 7),
      port(22, 'TCP', 50, 2),
      port(53, 'UDP', 700, 5),
      port(3306, 'TCP', 5, 1),
      port(502, 'TCP', 400, 3),
      port(8080, 'TCP', 1, 1),
    ];

    const layout = buildItExposure([], [], ports);

    expect(layout.ports).toHaveLength(IT_EXPOSURE_PORT_CAP);
    expect(layout.ports.map((p) => p.port)).toEqual([80, 53, 502, 22, 443, 3306]);
    expect(layout.truncated).toBe(true);
  });
});
