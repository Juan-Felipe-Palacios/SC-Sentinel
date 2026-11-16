// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function nonceFrom(csp: string | null): string | null {
  const match = csp?.match(/'nonce-([^']+)'/);
  return match?.[1] ?? null;
}

describe('middleware CSP', () => {
  it('emite CSP con nonce en una ruta pública', async () => {
    const response = await middleware(new NextRequest('http://localhost/'));

    const csp = response.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(nonceFrom(csp)).toBeTruthy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("'strict-dynamic'");
  });

  it('genera nonces distintos en requests consecutivas', async () => {
    const first = await middleware(new NextRequest('http://localhost/'));
    const second = await middleware(new NextRequest('http://localhost/'));

    const firstNonce = nonceFrom(first.headers.get('content-security-policy'));
    const secondNonce = nonceFrom(second.headers.get('content-security-policy'));

    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
  });

  it('mantiene CSP en la redirección de /dashboard sin sesión', async () => {
    const response = await middleware(new NextRequest('http://localhost/dashboard/overview'));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(nonceFrom(response.headers.get('content-security-policy'))).toBeTruthy();
  });
});
