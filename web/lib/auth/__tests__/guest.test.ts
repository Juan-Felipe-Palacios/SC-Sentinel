// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GUEST_TTL_SECONDS,
  createGuestToken,
  verifyGuestToken,
} from '@/lib/auth/guest';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

const TEST_SECRET = 'test-guest-secret-with-32-bytes';

describe('lib/auth/guest', () => {
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

  it('firma un token de 1 h acotado al device', async () => {
    const created = await createGuestToken('dev_demo');

    expect(created.tokenId).toHaveLength(36);
    // El `exp` del JWT se redondea a segundos; tolerancia de 5 s.
    expect(created.expiresAt).toBeGreaterThan(
      Date.now() + (GUEST_TTL_SECONDS - 5) * 1000
    );
    expect(created.expiresAt).toBeLessThanOrEqual(Date.now() + GUEST_TTL_SECONDS * 1000);

    const session = await verifyGuestToken(created.token);
    expect(session).toEqual({
      deviceId: 'dev_demo',
      expiresAt: created.expiresAt,
      tokenId: created.tokenId,
    });
  });

  it('el token guest no sirve como sesión admin', async () => {
    const guest = await createGuestToken('dev_demo');
    await expect(verifySessionToken(guest.token)).resolves.toBe(false);
  });

  it('el token admin no sirve como sesión guest', async () => {
    const admin = await createSessionToken();
    await expect(verifyGuestToken(admin)).resolves.toBeNull();
  });

  it('rechaza tokens manipulados y basura', async () => {
    const guest = await createGuestToken('dev_demo');
    const tampered = `${guest.token.slice(0, -2)}xx`;
    await expect(verifyGuestToken(tampered)).resolves.toBeNull();
    await expect(verifyGuestToken('not-a-jwt')).resolves.toBeNull();
  });

  it('rechaza tokens firmados con otro secreto', async () => {
    const guest = await createGuestToken('dev_demo');
    process.env.SC_SESSION_SECRET = 'otro-secreto-distinto-de-32-bytes';
    await expect(verifyGuestToken(guest.token)).resolves.toBeNull();
  });
});
