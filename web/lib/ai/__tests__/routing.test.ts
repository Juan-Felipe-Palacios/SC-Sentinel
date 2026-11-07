import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProviderChain,
  callAiChain,
  PROVIDER_DEFAULT_MODELS,
} from '@/lib/ai/providers';
import { isCooling, markRateLimited, resetRateLimits } from '@/lib/ai/rate-limit';
import type { AiFacts } from '@/lib/ai/facts';

const facts: AiFacts = {
  period: { start: '2026-11-05T00:00:00.000Z', end: '2026-11-05T00:00:30.000Z' },
  total_bytes: 1000,
  total_packets: 10,
  top_hosts: [],
  top_ports: [],
  top_countries: [],
  alerts: [],
  health: null,
};

const validOutput = {
  summary: 'Tráfico normal.',
  risk_level: 'low',
  findings: [{ type: 'volume', description: 'Dentro de parámetros', severity: 'low' }],
  recommendations: ['Mantener observación.'],
};

function rateLimitError(): Error {
  return Object.assign(new Error('rate_limit_exceeded'), { status: 429 });
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimits();
});

describe('buildProviderChain', () => {
  it('ordena el primario primero y agrega solo los respaldos con key', () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'goog_x');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    vi.stubEnv('OPENROUTER_API_KEY', '');

    expect(buildProviderChain().map((entry) => entry.provider)).toEqual([
      'gemini',
      'groq',
    ]);
  });

  it('sin AI_PROVIDER usa la detección por key como primario', () => {
    vi.stubEnv('AI_PROVIDER', '');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    vi.stubEnv('GEMINI_API_KEY', 'goog_x');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-x');

    const chain = buildProviderChain();
    expect(chain[0]?.provider).toBe('groq');
    expect(chain.map((entry) => entry.provider)).toEqual([
      'groq',
      'gemini',
      'openrouter',
    ]);
  });

  it('los respaldos usan los defaults de SU proveedor (AI_MODELS no se filtra)', () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'goog_x');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-x');
    vi.stubEnv('AI_MODELS', 'gemini-custom');

    const chain = buildProviderChain();
    expect(chain[0]?.models).toEqual(['gemini-custom']);
    expect(chain[1]?.models).toEqual([...PROVIDER_DEFAULT_MODELS.openrouter]);
    expect(chain[2]?.models).toEqual([...PROVIDER_DEFAULT_MODELS.groq]);
  });

  it('incluye proveedores forzados aunque no haya key en env', () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'goog_x');
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');

    const chain = buildProviderChain({ forcedProviders: ['openrouter'] });
    expect(chain.map((entry) => entry.provider)).toEqual(['gemini', 'openrouter']);
  });
});

describe('callAiChain multi-proveedor', () => {
  it('cae al siguiente proveedor cuando el primario responde 429', async () => {
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-x');

    const groqClient = {
      chat: { completions: { create: vi.fn().mockRejectedValue(rateLimitError()) } },
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validOutput) } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await callAiChain(facts, {
      groqClient,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.model).toBe('openrouter/free');
    // La cadena de Groq prueba sus dos modelos antes de bajar de proveedor.
    expect(groqClient.chat.completions.create).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // El proveedor que agotó la cuota queda en cooldown.
    expect(isCooling('groq')).toBe(true);
    expect(isCooling('openrouter')).toBe(false);
  });

  it('salta un proveedor que ya está en cooldown', async () => {
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-x');

    markRateLimited('groq', 120);

    const groqClient = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } },
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validOutput) } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await callAiChain(facts, {
      groqClient,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(groqClient.chat.completions.create).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('devuelve rateLimited cuando todos los intentos fueron 429', async () => {
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');

    const groqClient = {
      chat: { completions: { create: vi.fn().mockRejectedValue(rateLimitError()) } },
    };

    const result = await callAiChain(facts, { groqClient });
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.output).toBeNull();
    expect(isCooling('groq')).toBe(true);
  });

  it('con provider explícito no sale del proveedor indicado', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'goog_x');
    vi.stubEnv('GROQ_API_KEY', 'gsk_x');

    const groqClient = {
      chat: { completions: { create: vi.fn().mockRejectedValue(rateLimitError()) } },
    };
    const fetchImpl = vi.fn();

    const result = await callAiChain(facts, {
      provider: 'groq',
      models: ['openai/gpt-oss-120b'],
      groqClient,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
