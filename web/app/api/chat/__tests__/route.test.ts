import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { POST } from '../route';

vi.mock('@/lib/auth/admin', () => ({
  verifyAdminAuth: vi.fn(),
}));

type AuthResult = Awaited<ReturnType<typeof verifyAdminAuth>>;

const mockedAuth = vi.mocked(verifyAdminAuth);

function chatRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedAuth.mockReset();
});

describe('POST /api/chat (seguridad)', () => {
  it('rechaza sin sesión/admin', async () => {
    mockedAuth.mockResolvedValue({ authenticated: false } as AuthResult);

    const response = await POST(chatRequest({ message: 'hola' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('rechaza intentos de elegir device desde el body', async () => {
    mockedAuth.mockResolvedValue({ authenticated: true } as AuthResult);

    const response = await POST(
      chatRequest({ message: 'hola', context: { deviceId: 'dev_otro' } })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('bad_request');
  });
});
