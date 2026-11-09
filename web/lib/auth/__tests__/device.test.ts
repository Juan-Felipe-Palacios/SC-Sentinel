// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateDeviceToken } from '@/lib/auth/device';

describe('authenticateDeviceToken (fallback de desarrollo)', () => {
  let previousDatabaseUrl: string | undefined;
  let previousDevToken: string | undefined;
  let previousDevAuth: string | undefined;

  beforeEach(() => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    previousDevToken = process.env.SC_INGEST_DEV_TOKEN;
    previousDevAuth = process.env.SC_DEV_AUTH;
    delete process.env.DATABASE_URL;
    delete process.env.SC_INGEST_DEV_TOKEN;
    delete process.env.SC_DEV_AUTH;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('DATABASE_URL', previousDatabaseUrl);
    restore('SC_INGEST_DEV_TOKEN', previousDevToken);
    restore('SC_DEV_AUTH', previousDevAuth);
  });

  it('en producción rechaza el token de desarrollo aunque esté configurado', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.SC_INGEST_DEV_TOKEN = 'token-de-desarrollo';

    const result = await authenticateDeviceToken('Bearer token-de-desarrollo');

    expect(result.valid).toBe(false);
  });

  it('fuera de producción acepta el token explícito', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    process.env.SC_INGEST_DEV_TOKEN = 'token-de-desarrollo';

    const result = await authenticateDeviceToken('Bearer token-de-desarrollo');

    expect(result).toMatchObject({
      valid: true,
      deviceId: 'dev_local_development',
    });
  });

  it('fuera de producción acepta SC_DEV_AUTH=1 con el token por defecto', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    process.env.SC_DEV_AUTH = '1';

    const result = await authenticateDeviceToken('Bearer sc-sentinel-dev-token');

    expect(result).toMatchObject({
      valid: true,
      deviceId: 'dev_local_development',
    });
  });
});
