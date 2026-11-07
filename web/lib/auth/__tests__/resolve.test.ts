// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createGuestToken } from '@/lib/auth/guest';
import { authorize } from '@/lib/auth/resolve';

const TEST_SECRET = 'test-resolve-secret-with-32-bytes';

function requestWithCookie(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/api/query', {
    headers: cookie ? { cookie } : undefined,
  });
}

describe('lib/auth/resolve', () => {
  let previousSecret: string | undefined;
  let previousAdminSecret: string | undefined;

  beforeEach(() => {
    previousSecret = process.env.SC_SESSION_SECRET;
    previousAdminSecret = process.env.ADMIN_SECRET;
    process.env.SC_SESSION_SECRET = TEST_SECRET;
    delete process.env.ADMIN_SECRET;
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.SC_SESSION_SECRET;
    else process.env.SC_SESSION_SECRET = previousSecret;
    if (previousAdminSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = previousAdminSecret;
  });

  it('sin credenciales devuelve 401', async () => {
    const result = await authorize(requestWithCookie(), { allowGuest: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('permite guest donde allowGuest es true y expone su device', async () => {
    const { token } = await createGuestToken('dev_demo');
    const result = await authorize(requestWithCookie(`sc_guest=${token}`), {
      allowGuest: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth.role).toBe('guest');
      if (result.auth.role === 'guest') {
        expect(result.auth.guest.deviceId).toBe('dev_demo');
      }
    }
  });

  it('devuelve 403 para guest en rutas solo-admin', async () => {
    const { token } = await createGuestToken('dev_demo');
    const result = await authorize(requestWithCookie(`sc_guest=${token}`));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: 'forbidden',
      });
    }
  });
});
