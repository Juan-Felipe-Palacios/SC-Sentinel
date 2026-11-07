// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Garantía del modo visitante: sin conversación, sin historial y con 1000 tokens.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  appendMessage: vi.fn(),
  getConversation: vi.fn(),
  getRecentMessages: vi.fn(),
  streamChatCompletion: vi.fn(),
}));

vi.mock('@/lib/auth/resolve', () => ({
  authorize: vi.fn().mockResolvedValue({
    ok: true,
    auth: {
      role: 'guest',
      guest: { deviceId: 'dev_demo', expiresAt: Date.now() + 3_600_000, tokenId: 'token-1' },
    },
  }),
  clientIp: () => '203.0.113.50',
}));

vi.mock('@/lib/rate-limit/guest', () => ({
  checkGuestChatLimit: vi.fn(() => ({ allowed: true })),
  guestRateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/chat/history', () => ({
  createConversation: mocks.createConversation,
  appendMessage: mocks.appendMessage,
  getConversation: mocks.getConversation,
  getRecentMessages: mocks.getRecentMessages,
  titleFromMessage: () => 'consulta',
}));

vi.mock('@/lib/chat/rag', () => ({
  fetchChatContext: vi.fn().mockResolvedValue({
    period: { start: '2026-11-07T00:00:00.000Z', end: '2026-11-08T00:00:00.000Z' },
    totals: { bytes: 0, packets: 0, windows: 0, alerts: 0 },
    topHosts: [],
    topPorts: [],
    topCountries: [],
    alerts: [],
    health: null,
  }),
}));

vi.mock('@/lib/chat/context-builder', () => ({
  buildLlmMessages: () => [{ role: 'user', content: 'hola' }],
  summarizeSources: () => [],
}));

vi.mock('@/lib/chat/suggestions', () => ({
  buildSuggestions: () => [],
  detectQueryType: () => 'general',
  isExportableQuery: () => false,
}));

vi.mock('@/lib/chat/validator', () => ({
  validateChatAnswer: () => ({ warnings: [] }),
}));

vi.mock('@/lib/chat/llm', () => ({
  CHAT_LLM_TIMEOUT_MS: 30_000,
  ChatLlmError: class ChatLlmError extends Error {},
  estimateTokens: (text: string) => Math.ceil(text.length / 4),
  resolveChatModelPlan: () => ({ provider: 'groq', models: ['test-model'] }),
  streamChatCompletion: mocks.streamChatCompletion,
}));

import { POST } from '../route';

function guestChatRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chat?device_id=dev_otro', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.createConversation.mockReset();
  mocks.appendMessage.mockReset();
  mocks.getConversation.mockReset();
  mocks.getRecentMessages.mockReset();
  mocks.streamChatCompletion.mockReset();
  mocks.streamChatCompletion.mockImplementation(async function* () {
    yield { type: 'delta', text: 'Hola' };
    yield { type: 'usage', tokensUsed: 42, model: 'test-model', provider: 'groq' };
  });
});

describe('POST /api/chat (visitante)', () => {
  it('no crea conversación, ignora conversationId y no persiste mensajes', async () => {
    const response = await POST(
      guestChatRequest({ message: 'hola', conversationId: 'conv_admin' })
    );

    expect(response.status).toBe(200);
    const stream = await response.text();

    expect(stream).toContain('"conversationId":null');
    expect(mocks.getConversation).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.getRecentMessages).not.toHaveBeenCalled();
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it('fuerza 1000 tokens y 20 s de timeout, y usa el device del token', async () => {
    await POST(guestChatRequest({ message: 'hola' }));

    expect(mocks.streamChatCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        maxOutputTokens: 1000,
        tokenBudget: 1000,
        timeoutMs: 20_000,
      })
    );

    const { fetchChatContext } = await import('@/lib/chat/rag');
    expect(fetchChatContext).toHaveBeenCalledWith('dev_demo');
  });
});
