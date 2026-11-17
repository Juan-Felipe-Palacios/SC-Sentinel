// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDeviceId } from '@/lib/query/device';
import type { QueryDb } from '@/lib/query/db-rows';

function fakeDb(rows: unknown[]): QueryDb {
  return {
    execute: vi.fn(async () => rows),
  } as QueryDb;
}

describe('resolveDeviceId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('respeta un device explícito sin consultar la base', async () => {
    const database = fakeDb([{ id: 'dev_ignored' }]);

    await expect(resolveDeviceId('dev_explicit', database)).resolves.toBe('dev_explicit');
    expect(database.execute).not.toHaveBeenCalled();
  });

  it('usa DEFAULT_DEVICE_ID si está configurado', async () => {
    vi.stubEnv('DEFAULT_DEVICE_ID', 'dev_default');

    await expect(resolveDeviceId(undefined, fakeDb([]))).resolves.toBe('dev_default');
  });

  it('sin configuración devuelve el device que la consulta ordena como más reciente', async () => {
    const database = fakeDb([{ id: 'dev_real_reciente' }]);

    await expect(resolveDeviceId(undefined, database)).resolves.toBe('dev_real_reciente');
    expect(database.execute).toHaveBeenCalledTimes(1);
  });

  it('devuelve null si no hay devices', async () => {
    await expect(resolveDeviceId(undefined, fakeDb([]))).resolves.toBeNull();
  });
});
