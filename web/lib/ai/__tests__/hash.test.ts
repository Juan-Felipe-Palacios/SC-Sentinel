import { describe, expect, it } from 'vitest';
import { canonicalJson, factsHash } from '@/lib/ai/hash';

describe('canonicalJson', () => {
  it('es estable ante el orden de las claves', () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('es estable ante el orden de las claves anidadas', () => {
    const a = { z: { y: 1, x: [{ q: 2, p: 3 }] }, a: 'x' };
    const b = { a: 'x', z: { x: [{ p: 3, q: 2 }], y: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('distingue arrays en distinto orden (orden intencional del agente)', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('serializa undefined/null como null en objetos', () => {
    expect(canonicalJson({ a: undefined })).toBe('{"a":null}');
  });
});

describe('factsHash', () => {
  const facts = {
    period: { start: '2026-11-03T00:00:00.000Z', end: '2026-11-03T00:00:30.000Z' },
    total_bytes: 1234,
    total_packets: 42,
    top_hosts: [{ host_key: 'abc', country: 'AR', bytes: 100, packets: 2 }],
    top_ports: [{ port: 443, protocol: 'tcp', bytes: 100, connections: 1 }],
    top_countries: [{ country: 'AR', bytes: 100, hosts: 1 }],
    alerts: [],
    health: null,
  };

  it('produce hash sha256 estable para mismos facts', () => {
    expect(factsHash(facts)).toBe(factsHash({ ...facts }));
    expect(factsHash(facts)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia cuando cambian los facts', () => {
    expect(factsHash(facts)).not.toBe(factsHash({ ...facts, total_bytes: 1235 }));
  });
});
