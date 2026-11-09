// web/lib/trust/__tests__/access-log.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { anonymizeIp, hashUserAgent } from '@/lib/trust/access-log';

describe('anonymizeIp', () => {
  it('enmascara los dos últimos octetos IPv4', () => {
    expect(anonymizeIp('192.168.1.45')).toBe('192.168.*.*');
    expect(anonymizeIp('10.0.0.1')).toBe('10.0.*.*');
  });
  it('enmascara IPv6 tras el primer hexteto', () => {
    expect(anonymizeIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:*');
  });
  it('pasa unknown y vacío sin filtrar datos', () => {
    expect(anonymizeIp('unknown')).toBe('unknown');
    expect(anonymizeIp('')).toBe('unknown');
  });
});

describe('hashUserAgent', () => {
  it('produce sha256 hex determinista', () => {
    const hash = hashUserAgent('Mozilla/5.0');
    expect(hash).toBe(hashUserAgent('Mozilla/5.0'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashUserAgent('')).toBe('');
  });
});
