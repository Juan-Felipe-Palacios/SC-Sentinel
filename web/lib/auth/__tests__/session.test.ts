// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, getSessionSecret, verifySessionToken } from '@/lib/auth/session';

const TEST_SECRET = 'test-session-secret-with-32-bytes';

describe('lib/auth/session', () => {
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

  it('roundtrip: firma y verifica un token válido', async () => {
    const token = await createSessionToken();
    expect(typeof token).toBe('string');
    await expect(verifySessionToken(token)).resolves.toBe(true);
  });

  it('rechaza un token manipulado', async () => {
    const token = await createSessionToken();
    const tampered = `${token.slice(0, -2)}xx`;
    await expect(verifySessionToken(tampered)).resolves.toBe(false);
  });

  it('rechaza tokens firmados con otro secreto', async () => {
    const token = await createSessionToken();
    process.env.SC_SESSION_SECRET = 'otro-secreto-distinto-de-32-bytes';
    await expect(verifySessionToken(token)).resolves.toBe(false);
  });

  it('rechaza basura', async () => {
    await expect(verifySessionToken('not-a-jwt')).resolves.toBe(false);
  });

  it('exige un secreto de al menos 32 caracteres', () => {
    process.env.SC_SESSION_SECRET = 'secreto-demasiado-corto';
    expect(() => getSessionSecret()).toThrow(/32 caracteres/);
  });

  it('no reutiliza ADMIN_SECRET como secreto de sesión', () => {
    delete process.env.SC_SESSION_SECRET;
    process.env.ADMIN_SECRET = TEST_SECRET;
    expect(() => getSessionSecret()).toThrow(/SC_SESSION_SECRET/);
  });
});
