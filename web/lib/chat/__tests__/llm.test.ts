import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatLlmMessage } from '../types';
import { estimateTokens, resolveChatModelPlan, streamChatCompletion } from '../llm';
import { isCooling, markRateLimited, resetRateLimits } from '@/lib/ai/rate-limit';

const messages: ChatLlmMessage[] = [
  { role: 'system', content: 'Sos un asistente.' },
  { role: 'user', content: '¿Qué host domina?' },
];

function sseStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

const OK_SSE = [
  'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" mundo"}}]}\n\n',
  'data: {"usage":{"total_tokens":42}}\n\n',
  'data: [DONE]\n\n',
].join('');

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimits();
});

describe('streamChatCompletion', () => {
  it('emite deltas y tokens de uso desde un stream OpenAI-compatible', async () => {
    const fetchImpl = vi.fn(async () => new Response(sseStream(OK_SSE), { status: 200 }));

    const chunks = [];
    for await (const chunk of streamChatCompletion(messages, {
      provider: 'groq',
      models: ['test-model'],
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      chunks.push(chunk);
    }

    expect(
      chunks
        .filter((chunk) => chunk.type === 'delta')
        .map((chunk) => (chunk.type === 'delta' ? chunk.text : ''))
        .join('')
    ).toBe('Hola mundo');

    expect(chunks.at(-1)).toEqual({
      type: 'usage',
      tokensUsed: 42,
      model: 'test-model',
      provider: 'groq',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(true);
  });

  it('prueba el siguiente modelo si el primero falla antes de emitir deltas', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('upstream error', { status: 500 }))
      .mockResolvedValueOnce(new Response(sseStream(OK_SSE), { status: 200 }));

    const chunks = [];
    for await (const chunk of streamChatCompletion(messages, {
      provider: 'groq',
      models: ['bad-model', 'good-model'],
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      chunks.push(chunk);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(chunks.at(-1)).toMatchObject({
      type: 'usage',
      model: 'good-model',
      provider: 'groq',
    });
  });

  it('salta al siguiente proveedor cuando el primario responde 429', async () => {
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate_limit_exceeded', {
          status: 429,
          headers: { 'retry-after': '30' },
        })
      )
      .mockResolvedValueOnce(new Response(sseStream(OK_SSE), { status: 200 }));

    const chunks = [];
    for await (const chunk of streamChatCompletion(messages, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      chunks.push(chunk);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('api.groq.com');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('openrouter.ai');
    expect(chunks.at(-1)).toMatchObject({
      type: 'usage',
      provider: 'openrouter',
    });
    // El proveedor rate-limiteado queda en cooldown para las siguientes llamadas.
    expect(isCooling('groq')).toBe(true);
  });

  it('devuelve rate_limited cuando todos los proveedores están en cooldown', async () => {
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    markRateLimited('groq', 120);

    async function drain() {
      const generator = streamChatCompletion(messages, {
        fetchImpl: vi.fn() as unknown as typeof fetch,
      });
      await generator.next();
    }

    await expect(drain()).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('falla con un código seguro cuando falta la API key', async () => {
    vi.stubEnv('GROQ_API_KEY', '');

    async function drain() {
      const generator = streamChatCompletion(messages, {
        provider: 'groq',
        models: ['test-model'],
        fetchImpl: vi.fn() as unknown as typeof fetch,
      });
      await generator.next();
    }

    await expect(drain()).rejects.toMatchObject({ code: 'missing_api_key' });
  });
});

describe('resolveChatModelPlan', () => {
  it('respeta modelos explícitos y usa los defaults si la lista está vacía', () => {
    expect(resolveChatModelPlan({ provider: 'groq', models: ['a', 'b'] })).toEqual({
      provider: 'groq',
      models: ['a', 'b'],
    });
    expect(resolveChatModelPlan({ provider: 'groq', models: [] }).models.length).toBeGreaterThan(0);
  });
});

describe('estimateTokens', () => {
  it('estima al menos 1 token', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('hola mundo')).toBe(3);
  });
});
