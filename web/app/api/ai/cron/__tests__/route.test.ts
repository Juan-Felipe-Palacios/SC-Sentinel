// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveDeviceId } from '@/lib/query/device';
import { checkDailyBudget, runAiPipeline } from '@/lib/ai';
import { GET, POST } from '../route';

vi.mock('@/lib/query/device', () => ({
  resolveDeviceId: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  AI_CRON_MIN_INTERVAL_MS: 15 * 60_000,
  checkDailyBudget: vi.fn(),
  runAiPipeline: vi.fn(),
}));

const mockedResolveDevice = vi.mocked(resolveDeviceId);
const mockedBudget = vi.mocked(checkDailyBudget);
const mockedPipeline = vi.mocked(runAiPipeline);

function cronRequest(secret = 'test-cron-secret'): NextRequest {
  return new NextRequest('http://localhost/api/ai/cron', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  });
}

describe('/api/ai/cron', () => {
  let previousSecret: string | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret';
    mockedResolveDevice.mockReset();
    mockedBudget.mockReset();
    mockedPipeline.mockReset();
    mockedBudget.mockResolvedValue({ exhausted: false, used: 0, budget: 0 });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
    errorSpy.mockRestore();
  });

  it('GET devuelve 404 no-store', async () => {
    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rechaza un secreto ausente o inválido sin consultar la base', async () => {
    const missing = await POST(cronRequest(''));
    const wrong = await POST(cronRequest('otro'));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(missing.headers.get('cache-control')).toContain('no-store');
    expect(mockedBudget).not.toHaveBeenCalled();
    expect(mockedResolveDevice).not.toHaveBeenCalled();
  });

  it('valida el presupuesto antes de resolver el device', async () => {
    mockedBudget.mockResolvedValue({ exhausted: true, used: 10, budget: 10 });

    const response = await POST(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'budget_exhausted' });
    expect(mockedResolveDevice).not.toHaveBeenCalled();
    expect(mockedPipeline).not.toHaveBeenCalled();
  });

  it('devuelve no_data si no hay device, con no-store', async () => {
    mockedResolveDevice.mockResolvedValue(null);

    const response = await POST(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'no_data' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('ejecuta el pipeline con el presupuesto ya validado', async () => {
    mockedResolveDevice.mockResolvedValue('dev_real');
    mockedPipeline.mockResolvedValue({ status: 'ok', insight: null });

    const response = await POST(cronRequest());

    expect(response.status).toBe(200);
    expect(mockedPipeline).toHaveBeenCalledWith(
      'dev_real',
      undefined,
      'es',
      expect.objectContaining({ skipBudgetCheck: true })
    );
  });

  it('clasifica un fallo de base y no filtra el error al cuerpo', async () => {
    const dbError = Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
    mockedBudget.mockRejectedValue(dbError);

    const response = await POST(cronRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'internal_error',
      error_name: 'ECONNREFUSED',
    });

    const logged = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('"event":"ai_cron_failed"');
    expect(logged).toContain('"code":"db_unavailable"');
    expect(logged).toContain('fetch failed');
  });
});
