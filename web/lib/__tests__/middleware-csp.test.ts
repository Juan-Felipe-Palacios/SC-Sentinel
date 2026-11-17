// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function nonceFrom(csp: string | null): string | null {
  const match = csp?.match(/'nonce-([^']+)'/);
  return match?.[1] ?? null;
}

function reportOnlyHeader(response: Response): string | null {
  return response.headers.get('content-security-policy-report-only');
}

function enforcedHeader(response: Response): string | null {
  return response.headers.get('content-security-policy');
}

describe('middleware CSP', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fuera de desarrollo emite Report-Only y no aplica la política', async () => {
    const response = await middleware(new NextRequest('http://localhost/'));

    const csp = reportOnlyHeader(response);
    expect(csp).toBeTruthy();
    expect(enforcedHeader(response)).toBeNull();
    expect(nonceFrom(csp)).toBeTruthy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).toContain('report-to csp-endpoint');
    expect(response.headers.get('reporting-endpoints')).toBe('csp-endpoint="/api/csp-report"');
  });

  it('genera nonces distintos en requests consecutivas', async () => {
    const first = await middleware(new NextRequest('http://localhost/'));
    const second = await middleware(new NextRequest('http://localhost/'));

    const firstNonce = nonceFrom(reportOnlyHeader(first));
    const secondNonce = nonceFrom(reportOnlyHeader(second));

    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
  });

  it('mantiene CSP en la redirección de /dashboard sin sesión', async () => {
    const response = await middleware(new NextRequest('http://localhost/dashboard/overview'));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(nonceFrom(reportOnlyHeader(response))).toBeTruthy();
  });

  it('en desarrollo aplica la política y no la reporta', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = await middleware(new NextRequest('http://localhost/'));

    expect(nonceFrom(enforcedHeader(response))).toBeTruthy();
    expect(reportOnlyHeader(response)).toBeNull();
    expect(response.headers.get('reporting-endpoints')).toBeNull();
  });

  it('con CSP_ENFORCE=1 aplica la política en preview', async () => {
    vi.stubEnv('CSP_ENFORCE', '1');

    const response = await middleware(new NextRequest('http://localhost/'));

    const csp = enforcedHeader(response);
    expect(nonceFrom(csp)).toBeTruthy();
    expect(csp).not.toContain('report-uri');
    expect(reportOnlyHeader(response)).toBeNull();
  });
});
