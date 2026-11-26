// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { getDeviceById } from '@/lib/query/devices';
import { listOtAssets, type OtAssetRecord } from '@/lib/query/ot-assets';
import { GET } from '../route';

vi.mock('@/lib/auth/resolve', () => ({
  authorize: vi.fn(),
}));

vi.mock('@/lib/query/devices', () => ({
  getDeviceById: vi.fn(),
}));

vi.mock('@/lib/query/ot-assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/query/ot-assets')>();
  return { ...actual, listOtAssets: vi.fn() };
});

const mockedAuthorize = vi.mocked(authorize);
const mockedGetDevice = vi.mocked(getDeviceById);
const mockedList = vi.mocked(listOtAssets);

const asset: OtAssetRecord = {
  id: 'ota_1',
  device_id: 'dev_1',
  host_key: 'a'.repeat(32),
  first_seen: '2026-11-20T10:00:00.000Z',
  last_seen: '2026-11-25T18:00:00.000Z',
  seen_windows: 3,
  role: 'server',
  protocols: ['modbus'],
  vendor: 'siemens',
  vendor_source: 'oui',
  model_hint: null,
  zone: 'planta-1',
  label: 'PLC línea 2',
  baseline_state: 'disabled',
  peers: [],
  risk_flags: [],
};

const device = {
  id: 'dev_1',
  name: 'Sensor planta',
  status: 'active',
  enrolled_at: '2026-11-01T00:00:00.000Z',
  last_seen_at: '2026-11-25T18:00:00.000Z',
};

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/devices/dev_1/ot-assets${query}`);
}

function context(id = 'dev_1') {
  return { params: Promise.resolve({ id }) };
}

function admin() {
  mockedAuthorize.mockResolvedValue({ ok: true, auth: { role: 'admin' } });
}

beforeEach(() => {
  mockedAuthorize.mockReset();
  mockedGetDevice.mockReset();
  mockedList.mockReset();
});

describe('GET /api/devices/[id]/ot-assets', () => {
  it('rechaza al visitante sin consultar la base', async () => {
    mockedAuthorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('devuelve los activos OT del dispositivo', async () => {
    admin();
    mockedGetDevice.mockResolvedValue(device);
    mockedList.mockResolvedValue([asset]);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      device_id: 'dev_1',
      count: 1,
      assets: [asset],
    });
    expect(mockedList).toHaveBeenCalledWith('dev_1', { limit: 100 });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('devuelve 404 si el dispositivo no existe', async () => {
    admin();
    mockedGetDevice.mockResolvedValue(null);

    const response = await GET(request(), context('dev_missing'));

    expect(response.status).toBe(404);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('acota limit a 200', async () => {
    admin();
    mockedGetDevice.mockResolvedValue(device);
    mockedList.mockResolvedValue([]);

    const response = await GET(request('?limit=500'), context());

    expect(response.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith('dev_1', { limit: 200 });
  });

  it('rechaza un limit inválido sin consultar', async () => {
    admin();

    for (const query of ['?limit=0', '?limit=-3', '?limit=abc', '?limit=1.5']) {
      const response = await GET(request(query), context());
      expect(response.status).toBe(400);
    }

    expect(mockedList).not.toHaveBeenCalled();
  });

  it('devuelve 500 si la tabla no está disponible (0017 sin aplicar)', async () => {
    admin();
    mockedGetDevice.mockResolvedValue(device);
    mockedList.mockRejectedValue(new Error('relation "ot_assets" does not exist'));

    const response = await GET(request(), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal_error' });
  });
});
