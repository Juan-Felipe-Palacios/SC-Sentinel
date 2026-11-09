// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { checkGuestRequestLimit } from '@/lib/rate-limit/guest';
import { queryEvals } from '@/lib/query/evals';
import { GET } from '../route';

vi.mock('@/lib/auth/resolve', () => ({
  authorize: vi.fn(),
  clientIp: vi.fn(() => '203.0.113.50'),
}));

vi.mock('@/lib/rate-limit/guest', () => ({
  checkGuestRequestLimit: vi.fn(),
  guestRateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/query/evals', () => ({
  queryEvals: vi.fn(),
}));

vi.mock('@/lib/query/device', () => ({
  resolveDeviceId: vi.fn(async () => 'dev_default'),
}));

const mockedAuthorize = vi.mocked(authorize);
const mockedLimit = vi.mocked(checkGuestRequestLimit);
const mockedEvals = vi.mocked(queryEvals);

function request(): NextRequest {
  return new NextRequest('http://localhost/api/query?metric=evals');
}

describe('GET /api/query?metric=evals', () => {
  beforeEach(() => {
    mockedLimit.mockReturnValue({ allowed: true });
    mockedEvals.mockReset();
  });

  it('devuelve 403 al visitante sin consultar métricas globales', async () => {
    mockedAuthorize.mockResolvedValue({
      ok: true,
      auth: {
        role: 'guest',
        guest: { deviceId: 'dev_demo', expiresAt: Date.now() + 60_000, tokenId: 'token' },
      },
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockedEvals).not.toHaveBeenCalled();
  });

  it('permite la consulta al admin', async () => {
    mockedAuthorize.mockResolvedValue({ ok: true, auth: { role: 'admin' } });
    mockedEvals.mockResolvedValue({
      success_rate: 1,
      total: 2,
      succeeded: 2,
      latency_p50_ms: 10,
      latency_p95_ms: 20,
      daily_cost: [],
      by_model: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mockedEvals).toHaveBeenCalledWith('1h');
  });
});
