// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

function loginRequest(password: string, ip = '198.51.100.20'): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({ password }),
  });
}

describe('POST /api/auth/login', () => {
  let previousAdminSecret: string | undefined;
  let previousSessionSecret: string | undefined;
  let previousDevAuth: string | undefined;

  beforeEach(() => {
    previousAdminSecret = process.env.ADMIN_SECRET;
    previousSessionSecret = process.env.SC_SESSION_SECRET;
    previousDevAuth = process.env.SC_DEV_AUTH;
    delete process.env.ADMIN_SECRET;
    delete process.env.SC_DEV_AUTH;
  });

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('ADMIN_SECRET', previousAdminSecret);
    restore('SC_SESSION_SECRET', previousSessionSecret);
    restore('SC_DEV_AUTH', previousDevAuth);
  });

  it('bloquea con 429 el sexto intento fallido desde la misma IP', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await POST(loginRequest('contraseña-incorrecta', '198.51.100.21'));
      statuses.push(response.status);
      if (attempt === 5) {
        expect(response.headers.get('retry-after')).toBeTruthy();
      }
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('permite iniciar sesión con la contraseña correcta', async () => {
    process.env.ADMIN_SECRET = 'test-admin-password-123456';
    process.env.SC_SESSION_SECRET = 'test-login-session-secret-32-bytes';

    const response = await POST(loginRequest('test-admin-password-123456', '198.51.100.22'));

    expect(response.status).toBe(200);
    expect(response.cookies.get('sc_session')?.httpOnly).toBe(true);
  });

  it('sin ADMIN_SECRET acepta con SC_DEV_AUTH=1 fuera de producción', async () => {
    process.env.SC_DEV_AUTH = '1';
    process.env.SC_SESSION_SECRET = 'test-login-session-secret-32-bytes';

    const response = await POST(loginRequest('cualquier-password', '198.51.100.23'));

    expect(response.status).toBe(200);
    expect(response.cookies.get('sc_session')?.httpOnly).toBe(true);
  });
});
