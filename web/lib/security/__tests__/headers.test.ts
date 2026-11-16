// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  buildGlobalSecurityHeaders,
  buildTrustPageHeaders,
} from '../headers';

function headerValue(headers: { key: string; value: string }[], key: string): string | undefined {
  return headers.find((header) => header.key === key)?.value;
}

describe('cabeceras de seguridad', () => {
  it('la CSP de producción bloquea iframes, objetos y upgrades inseguros', () => {
    const csp = buildContentSecurityPolicy('test-nonce-123', false);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('añade HSTS solo en producción', () => {
    const production = buildGlobalSecurityHeaders(false);
    const development = buildGlobalSecurityHeaders(true);

    expect(headerValue(production, 'Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains'
    );
    expect(headerValue(development, 'Strict-Transport-Security')).toBeUndefined();
    expect(headerValue(production, 'X-Frame-Options')).toBe('DENY');
    expect(headerValue(production, 'X-Content-Type-Options')).toBe('nosniff');
  });

  it('habilita eval y websockets solo en desarrollo', () => {
    expect(buildContentSecurityPolicy('test-nonce-123', true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy('test-nonce-123', true)).toContain('ws:');
    expect(buildContentSecurityPolicy('test-nonce-123', false)).not.toContain('ws:');
  });

  it('inserta el nonce y elimina unsafe-inline de script-src en producción', () => {
    const csp = buildContentSecurityPolicy('nonce-abc', false);

    expect(csp).toContain("script-src 'self' 'nonce-nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('las cabeceras globales ya no incluyen CSP estática', () => {
    const production = buildGlobalSecurityHeaders(false);

    expect(headerValue(production, 'Content-Security-Policy')).toBeUndefined();
  });

  it('rechaza un nonce inválido', () => {
    expect(() => buildContentSecurityPolicy("bad'nonce", false)).toThrow();
  });

  it('la Trust Page no filtra el token por Referer ni cachea la respuesta', () => {
    const headers = buildTrustPageHeaders();

    expect(headerValue(headers, 'Referrer-Policy')).toBe('no-referrer');
    expect(headerValue(headers, 'Cache-Control')).toBe('private, no-store, max-age=0');
  });
});
