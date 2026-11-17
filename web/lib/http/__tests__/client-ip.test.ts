// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { clientIp } from '@/lib/http/client-ip';

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/ingest', { headers });
}

describe('clientIp', () => {
  let previousTrustProxy: string | undefined;
  let previousVercel: string | undefined;

  beforeEach(() => {
    previousTrustProxy = process.env.TRUST_PROXY;
    previousVercel = process.env.VERCEL;
    delete process.env.TRUST_PROXY;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  });

  it('ignora X-Forwarded-For si no hay proxy declarado', () => {
    const ip = clientIp(request({ 'x-forwarded-for': '203.0.113.10' }));

    expect(ip).toBe('unknown');
  });

  it('usa la primera IP válida cuando TRUST_PROXY=1', () => {
    process.env.TRUST_PROXY = '1';

    const ip = clientIp(
      request({ 'x-forwarded-for': '198.51.100.7, 10.0.0.2', 'x-real-ip': '198.51.100.8' })
    );

    expect(ip).toBe('198.51.100.7');
  });

  it('rechaza valores que no son IP', () => {
    process.env.TRUST_PROXY = '1';

    const ip = clientIp(request({ 'x-forwarded-for': 'not-an-ip' }));

    expect(ip).toBe('unknown');
  });

  it('en Vercel prefiere x-vercel-forwarded-for', () => {
    process.env.VERCEL = '1';

    const ip = clientIp(
      request({
        'x-vercel-forwarded-for': '192.0.2.44',
        'x-forwarded-for': '203.0.113.99',
      })
    );

    expect(ip).toBe('192.0.2.44');
  });
});
