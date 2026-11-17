// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceById, listDevices } from '@/lib/query/devices';
import { resolveGuestDevice } from '@/lib/auth/guest-device';
import { SYNTHETIC_DEMO_DEVICE_ID } from '@/lib/demo/synthetic';

vi.mock('@/lib/query/devices', () => ({
  getDeviceById: vi.fn(),
  listDevices: vi.fn(),
}));

const mockedGetDevice = vi.mocked(getDeviceById);
const mockedListDevices = vi.mocked(listDevices);

describe('resolveGuestDevice', () => {
  let previousGuest: string | undefined;
  let previousDefault: string | undefined;

  beforeEach(() => {
    previousGuest = process.env.SC_GUEST_DEVICE_ID;
    previousDefault = process.env.DEFAULT_DEVICE_ID;
    delete process.env.SC_GUEST_DEVICE_ID;
    delete process.env.DEFAULT_DEVICE_ID;
    mockedGetDevice.mockReset();
    mockedListDevices.mockReset();
  });

  afterEach(() => {
    if (previousGuest === undefined) delete process.env.SC_GUEST_DEVICE_ID;
    else process.env.SC_GUEST_DEVICE_ID = previousGuest;
    if (previousDefault === undefined) delete process.env.DEFAULT_DEVICE_ID;
    else process.env.DEFAULT_DEVICE_ID = previousDefault;
  });

  it('sin allowlist devuelve el dataset sintético sin consultar devices', async () => {
    const result = await resolveGuestDevice();

    expect(result).toEqual({ deviceId: SYNTHETIC_DEMO_DEVICE_ID, error: null });
    expect(mockedGetDevice).not.toHaveBeenCalled();
    expect(mockedListDevices).not.toHaveBeenCalled();
  });

  it('rechaza cualquier device pedido que no sea el de la demo', async () => {
    const result = await resolveGuestDevice('dev_real');

    expect(result).toEqual({ deviceId: null, error: 'not_allowed' });
    expect(mockedGetDevice).not.toHaveBeenCalled();
  });

  it('respeta una allowlist explícita y valida el device contra la base', async () => {
    process.env.SC_GUEST_DEVICE_ID = 'dev_demo_real';
    mockedGetDevice.mockResolvedValue({
      id: 'dev_demo_real',
      name: 'Demo',
      status: 'active',
      enrolled_at: '2026-11-01T00:00:00.000Z',
      last_seen_at: null,
    });

    const result = await resolveGuestDevice();

    expect(result).toEqual({ deviceId: 'dev_demo_real', error: null });
    expect(mockedGetDevice).toHaveBeenCalledWith('dev_demo_real');
  });

  it('falla cerrado si el device configurado no existe o está revocado', async () => {
    process.env.SC_GUEST_DEVICE_ID = 'dev_demo_real';
    mockedGetDevice.mockResolvedValue(null);

    await expect(resolveGuestDevice()).resolves.toEqual({
      deviceId: null,
      error: 'not_found',
    });
  });
});
