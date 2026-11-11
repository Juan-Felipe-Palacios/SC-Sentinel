// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { rotateDeviceToken } from '@/lib/query/devices';
import { POST } from '../route';

vi.mock('@/lib/auth/resolve', () => ({
  authorize: vi.fn(),
}));

vi.mock('@/lib/query/devices', () => ({
  rotateDeviceToken: vi.fn(),
}));

const mockedAuthorize = vi.mocked(authorize);
const mockedRotate = vi.mocked(rotateDeviceToken);

function request(): NextRequest {
  return new NextRequest('http://localhost/api/devices/dev_1/rotate', { method: 'POST' });
}

function context(id = 'dev_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/devices/[id]/rotate', () => {
  beforeEach(() => {
    mockedAuthorize.mockReset();
    mockedRotate.mockReset();
  });

  it('rota el token para un admin y lo devuelve una vez', async () => {
    mockedAuthorize.mockResolvedValue({ ok: true, auth: { role: 'admin' } });
    mockedRotate.mockResolvedValue({ token: 'sc_dev_new' });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ device_id: 'dev_1', token: 'sc_dev_new' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rechaza al visitante sin tocar el token', async () => {
    mockedAuthorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(mockedRotate).not.toHaveBeenCalled();
  });

  it('devuelve 404 cuando el device no existe o está revocado', async () => {
    mockedAuthorize.mockResolvedValue({ ok: true, auth: { role: 'admin' } });
    mockedRotate.mockResolvedValue(null);

    const response = await POST(request(), context('dev_missing'));

    expect(response.status).toBe(404);
  });
});
