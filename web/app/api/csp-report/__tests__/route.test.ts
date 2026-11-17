// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

function reportRequest(
  body: unknown,
  options: { contentType?: string; ip?: string } = {}
): NextRequest {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': options.contentType ?? 'application/csp-report',
    'x-forwarded-for': options.ip ?? '203.0.113.60',
  };
  return new NextRequest('http://localhost/api/csp-report', {
    method: 'POST',
    headers,
    body: raw,
  });
}

function loggedEvents(spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

describe('POST /api/csp-report', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let previousTrustProxy: string | undefined;

  beforeEach(() => {
    previousTrustProxy = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = '1';
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
  });

  it('registra un reporte legacy saneado y responde 204', async () => {
    const response = await POST(
      reportRequest(
        {
          'csp-report': {
            'document-uri': 'https://sc-sentinel.vercel.app/dashboard/overview?device=dev_1#x',
            'blocked-uri': 'inline',
            'effective-directive': 'script-src',
            'original-policy': "script-src 'nonce-secreto123'",
            'script-sample': 'alert(1)',
          },
        },
        { ip: '203.0.113.61' }
      )
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const events = loggedEvents(warn);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      event: 'csp_violation',
      violations: [
        {
          directive: 'script-src',
          blocked: 'inline',
          document: 'https://sc-sentinel.vercel.app/dashboard/overview',
        },
      ],
    });
    // Ni la política original (nonce) ni el sample arbitrario llegan al log.
    expect(JSON.stringify(events[0])).not.toContain('nonce-secreto123');
    expect(JSON.stringify(events[0])).not.toContain('alert(1)');
  });

  it('registra en un solo log los reportes de Reporting API y descarta otros tipos', async () => {
    const response = await POST(
      reportRequest(
        [
          {
            type: 'csp-violation',
            body: {
              documentURL: 'https://sc-sentinel.vercel.app/p/tok_123456/legal',
              blockedURL: 'https://cdn.example.com/lib.js?v=1',
              effectiveDirective: 'script-src-elem',
              sourceFile: 'https://cdn.example.com/lib.js',
              lineNumber: 1,
            },
          },
          {
            type: 'csp-violation',
            body: {
              documentURL: 'https://sc-sentinel.vercel.app/demo',
              blockedURL: 'data:text/javascript,alert(1)',
              effectiveDirective: 'script-src-elem',
            },
          },
          { type: 'deprecation', body: { id: 'x' } },
        ],
        { contentType: 'application/reports+json', ip: '203.0.113.62' }
      )
    );

    expect(response.status).toBe(204);

    const events = loggedEvents(warn);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      event: 'csp_violation',
      violations: [
        {
          directive: 'script-src-elem',
          blocked: 'https://cdn.example.com/lib.js',
          document: 'https://sc-sentinel.vercel.app/p/[redacted]/legal',
        },
        {
          directive: 'script-src-elem',
          blocked: 'data:',
          document: 'https://sc-sentinel.vercel.app/demo',
        },
      ],
    });
  });

  it('descarta JSON inválido o sin violaciones sin loguear', async () => {
    const invalid = await POST(reportRequest('no-es-json', { ip: '203.0.113.63' }));
    const empty = await POST(reportRequest({ hola: 'mundo' }, { ip: '203.0.113.64' }));

    expect(invalid.status).toBe(204);
    expect(empty.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it('descarta un cuerpo que supera el límite antes de parsearlo', async () => {
    const oversized = JSON.stringify({ 'csp-report': { padding: 'x'.repeat(32 * 1024) } });
    const response = await POST(reportRequest(oversized, { ip: '203.0.113.65' }));

    expect(response.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
