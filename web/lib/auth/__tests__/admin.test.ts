// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/devices');
}

describe('verifyAdminAuth', () => {
  let previousDevAuth: string | undefined;

  beforeEach(() => {
    previousDevAuth = process.env.SC_DEV_AUTH;
    delete process.env.SC_DEV_AUTH;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (previousDevAuth === undefined) delete process.env.SC_DEV_AUTH;
    else process.env.SC_DEV_AUTH = previousDevAuth;
  });

  it('sin SC_DEV_AUTH no autentica en development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await expect(verifyAdminAuth(request())).resolves.toMatchObject({
      authenticated: false,
    });
  });

  it('con SC_DEV_AUTH=1 autentica en development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.SC_DEV_AUTH = '1';

    await expect(verifyAdminAuth(request())).resolves.toMatchObject({
      authenticated: true,
      user: 'dev_local',
    });
  });

  it('en producción no autentica aunque SC_DEV_AUTH=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.SC_DEV_AUTH = '1';

    await expect(verifyAdminAuth(request())).resolves.toMatchObject({
      authenticated: false,
    });
  });
});
