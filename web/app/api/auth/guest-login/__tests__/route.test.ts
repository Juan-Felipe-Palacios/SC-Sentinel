// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDeviceById, listDevices } from '@/lib/query/devices';
import { POST } from '../route';

vi.mock('@/lib/query/devices', () => ({
  getDeviceById: vi.fn(),
  listDevices: vi.fn(),
}));

const mockedGetDevice = vi.mocked(getDeviceById);
const mockedListDevices = vi.mocked(listDevices);

function guestRequest(body: unknown = {}, ip = '203.0.113.10'): NextRequest {
  return new NextRequest('http://localhost/api/auth/guest-login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

const device = {
  id: 'dev_demo',
  name: 'Demo',
  status: 'active',
  enrolled_at: '2026-11-01T00:00:00.000Z',
  last_seen_at: null,
};

describe('POST /api/auth/guest-login', () => {
  let previousDevice: string | undefined;
  let previousDefault: string | undefined;
  let previousSecret: string | undefined;

  beforeEach(() => {
    previousDevice = process.env.SC_GUEST_DEVICE_ID;
    previousDefault = process.env.DEFAULT_DEVICE_ID;
    previousSecret = process.env.SC_SESSION_SECRET;
    process.env.SC_GUEST_DEVICE_ID = 'dev_demo';
    delete process.env.DEFAULT_DEVICE_ID;
    process.env.SC_SESSION_SECRET = 'test-guest-login-secret-32-bytes';
    mockedGetDevice.mockReset();
    mockedListDevices.mockReset();
  });

  afterEach(() => {
    if (previousDevice === undefined) delete process.env.SC_GUEST_DEVICE_ID;
    else process.env.SC_GUEST_DEVICE_ID = previousDevice;
    if (previousDefault === undefined) delete process.env.DEFAULT_DEVICE_ID;
    else process.env.DEFAULT_DEVICE_ID = previousDefault;
    if (previousSecret === undefined) delete process.env.SC_SESSION_SECRET;
    else process.env.SC_SESSION_SECRET = previousSecret;
  });

  it('sin SC_GUEST_DEVICE_ID usa DEFAULT_DEVICE_ID (demo sin configuración)', async () => {
    delete process.env.SC_GUEST_DEVICE_ID;
    process.env.DEFAULT_DEVICE_ID = 'dev_default';
    mockedGetDevice.mockResolvedValue({ ...device, id: 'dev_default' });

    const response = await POST(guestRequest({}, '203.0.113.11'));

    expect(response.status).toBe(200);
    expect(mockedGetDevice).toHaveBeenCalledWith('dev_default');
  });

  it('sin ninguna variable usa el primer device no revocado', async () => {
    delete process.env.SC_GUEST_DEVICE_ID;
    mockedListDevices.mockResolvedValue([
      { ...device, id: 'dev_revocado', status: 'revoked' },
      device,
    ]);
    mockedGetDevice.mockResolvedValue(device);

    const response = await POST(guestRequest({}, '203.0.113.15'));

    expect(response.status).toBe(200);
    expect(mockedGetDevice).toHaveBeenCalledWith('dev_demo');
  });

  it('responde 404 si no hay ningún device para la demo', async () => {
    delete process.env.SC_GUEST_DEVICE_ID;
    mockedListDevices.mockResolvedValue([]);

    const response = await POST(guestRequest({}, '203.0.113.16'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'guest_device_unavailable',
    });
  });

  it('rechaza un device fuera de la allowlist sin consultar la base', async () => {
    const response = await POST(guestRequest({ deviceId: 'dev_otro' }, '203.0.113.12'));

    expect(response.status).toBe(403);
    expect(mockedGetDevice).not.toHaveBeenCalled();
  });

  it('emite cookie httpOnly de 1 h para el device habilitado', async () => {
    mockedGetDevice.mockResolvedValue(device);

    const response = await POST(guestRequest({}, '203.0.113.13'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { role: string; expiresIn: number };
    expect(body.role).toBe('guest');
    expect(body.expiresIn).toBe(3600);

    const cookie = response.cookies.get('sc_guest');
    expect(cookie?.value).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBeUndefined();
    // Una sesión guest no conserva la cookie admin.
    expect(response.cookies.get('sc_session')?.value).toBe('');
  });

  it('rechaza un device revocado', async () => {
    mockedGetDevice.mockResolvedValue({ ...device, status: 'revoked' });

    const response = await POST(guestRequest({}, '203.0.113.14'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'guest_device_unavailable',
    });
  });
});
