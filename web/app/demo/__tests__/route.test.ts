// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveGuestDevice } from '@/lib/auth/guest-device';
import { checkGuestDemoLimit } from '@/lib/rate-limit/guest';
import { GET } from '../route';

vi.mock('@/lib/auth/guest-device', () => ({
  resolveGuestDevice: vi.fn(),
}));

vi.mock('@/lib/rate-limit/guest', () => ({
  checkGuestDemoLimit: vi.fn(),
}));

const mockedResolve = vi.mocked(resolveGuestDevice);
const mockedLimit = vi.mocked(checkGuestDemoLimit);

function demoRequest(path = '/demo'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': '203.0.113.40' },
  });
}

describe('GET /demo', () => {
  let previousSecret: string | undefined;

  beforeEach(() => {
    previousSecret = process.env.SC_SESSION_SECRET;
    process.env.SC_SESSION_SECRET = 'test-demo-entry-secret-32-bytes-ok';
    mockedResolve.mockReset();
    mockedLimit.mockReset();
    mockedLimit.mockReturnValue({ allowed: true });
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.SC_SESSION_SECRET;
    else process.env.SC_SESSION_SECRET = previousSecret;
  });

  it('crea sesión guest y entra al dashboard', async () => {
    mockedResolve.mockResolvedValue({ deviceId: 'dev_demo', error: null });

    const response = await GET(demoRequest('/demo?next=/dashboard/overview'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/dashboard/overview');
    expect(response.cookies.get('sc_guest')?.value).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(response.cookies.get('sc_guest')?.httpOnly).toBe(true);
  });

  it('ignora un next externo o fuera del dashboard', async () => {
    mockedResolve.mockResolvedValue({ deviceId: 'dev_demo', error: null });

    const response = await GET(demoRequest('/demo?next=https://evil.example'));

    expect(response.headers.get('location')).toBe('http://localhost/dashboard/overview');
  });

  it('redirige al login si la demo no tiene device', async () => {
    mockedResolve.mockResolvedValue({ deviceId: null, error: 'not_found' });

    const response = await GET(demoRequest());

    expect(response.headers.get('location')).toBe('http://localhost/login?demo=unavailable');
    expect(response.cookies.get('sc_guest')).toBeUndefined();
  });

  it('redirige al login si se excede el límite de entradas', async () => {
    mockedLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 10 });

    const response = await GET(demoRequest());

    expect(response.headers.get('location')).toBe('http://localhost/login?demo=rate_limited');
  });
});
