import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callAiChain,
  callGeminiChain,
  callGroqChain,
  getModelsFor,
  resolveProvider,
  type GeminiClientLike,
  type GroqClientLike,
} from '@/lib/ai/providers';
import type { AiFacts } from '@/lib/ai/facts';

const facts: AiFacts = {
  period: { start: '2026-11-04T00:00:00.000Z', end: '2026-11-04T00:00:30.000Z' },
  total_bytes: 1000,
  total_packets: 10,
  top_hosts: [],
  top_ports: [],
  top_countries: [],
  alerts: [],
  health: null,
};

const validOutput = {
  summary: 'Tráfico normal con algo de SSH.',
  risk_level: 'low',
  findings: [{ type: 'volume', description: 'Dentro de parámetros', severity: 'low' }],
  recommendations: ['Mantener observación.'],
};

function geminiClient(text: string): GeminiClientLike {
  return {
    models: {
      generateContent: vi.fn().mockResolvedValue({ text }),
    },
  };
}

function groqClient(content: string, model = 'openai/gpt-oss-120b'): GroqClientLike {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({ model, choices: [{ message: { content } }] }),
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveProvider', () => {
  it('respeta AI_PROVIDER explícito', () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    expect(resolveProvider()).toBe('gemini');
  });

  it('sin AI_PROVIDER elige por la key disponible', () => {
    vi.stubEnv('AI_PROVIDER', '');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    expect(resolveProvider()).toBe('groq');

    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'goog_x');
    expect(resolveProvider()).toBe('gemini');

    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    expect(resolveProvider()).toBe('openrouter');
  });

  it('ignora un AI_PROVIDER desconocido', () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    expect(resolveProvider()).toBe('groq');
  });
});

describe('getModelsFor', () => {
  it('usa AI_MODELS cuando está definido', () => {
    vi.stubEnv('AI_MODELS', 'a, b');
    expect(getModelsFor('gemini')).toEqual(['a', 'b']);
  });

  it('cae a los defaults vigentes de cada proveedor', () => {
    vi.stubEnv('AI_MODELS', '');
    expect(getModelsFor('gemini')).toEqual(['gemini-3.8-flash']);
    expect(getModelsFor('groq')).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
    expect(getModelsFor('openrouter')).toEqual(['openrouter/free']);
  });
});

describe('callGeminiChain', () => {
  it('devuelve ok con JSON válido', async () => {
    const client = geminiClient(JSON.stringify(validOutput));
    const result = await callGeminiChain(facts, { client, models: ['gemini-3.8-flash'] });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('gemini-3.8-flash');
    expect(result.output?.risk_level).toBe('low');
  });

  it('degrada ante contenido inválido', async () => {
    const client = geminiClient('no-json');
    const result = await callGeminiChain(facts, { client, models: ['gemini-3.8-flash'] });
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
  });

  it('reintenta una vez ante 5xx transitorio y devuelve ok', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('This model is currently experiencing high demand.'), {
          status: 503,
        })
      )
      .mockResolvedValueOnce({ text: JSON.stringify(validOutput) });
    const client: GeminiClientLike = { models: { generateContent } };

    const result = await callGeminiChain(facts, { client, models: ['gemini-3.8-flash'] });

    expect(result.ok).toBe(true);
    expect(result.output?.risk_level).toBe('low');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('loguea status y mensaje del error cuando el 5xx es definitivo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const generateContent = vi.fn().mockRejectedValue(
      Object.assign(new Error('UNAVAILABLE: high demand'), { status: 503 })
    );
    const client: GeminiClientLike = { models: { generateContent } };

    const result = await callGeminiChain(facts, { client, models: ['gemini-3.8-flash'] });

    expect(result.ok).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(2); // reintento único incluido
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('"status":503');
    expect(logged).toContain('UNAVAILABLE: high demand');
    warn.mockRestore();
  });
});

describe('callGroqChain', () => {
  it('devuelve ok y registra el modelo real', async () => {
    const client = groqClient(JSON.stringify(validOutput), 'openai/gpt-oss-20b');
    const result = await callGroqChain(facts, { client, models: ['openai/gpt-oss-120b'] });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('openai/gpt-oss-20b');
  });

  it('pasa al siguiente modelo si el primero falla', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({ model: 'openai/gpt-oss-20b', choices: [{ message: { content: JSON.stringify(validOutput) } }] });
    const client: GroqClientLike = { chat: { completions: { create } } };
    const result = await callGroqChain(facts, {
      client,
      models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('openai/gpt-oss-20b');
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('callAiChain', () => {
  it('despacha al proveedor indicado', async () => {
    const result = await callAiChain(facts, {
      provider: 'groq',
      models: ['openai/gpt-oss-120b'],
      groqClient: groqClient(JSON.stringify(validOutput)),
    });
    expect(result.ok).toBe(true);
  });

  it('mantiene OpenRouter como ruta por defecto', async () => {
    vi.stubEnv('AI_PROVIDER', '');
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(validOutput) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const result = await callAiChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      openRouterApiKey: 'k',
      models: ['openrouter/free'],
    });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
