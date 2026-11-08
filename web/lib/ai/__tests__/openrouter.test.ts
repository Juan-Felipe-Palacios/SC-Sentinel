import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_OUTPUT_MAX_TOKENS,
  AiOutputSchema,
  callOpenRouterChain,
  DEFAULT_AI_MODELS,
  extractJsonObject,
  getModelChain,
} from '@/lib/ai/openrouter';
import type { AiFacts } from '@/lib/ai/facts';

const facts: AiFacts = {
  period: { start: '2026-11-03T00:00:00.000Z', end: '2026-11-03T00:00:30.000Z' },
  total_bytes: 123456,
  total_packets: 789,
  top_hosts: [{ host_key: 'h', ip: '203.0.113.9', country: 'AR', bytes: 1000, packets: 3 }],
  top_ports: [{ port: 443, protocol: 'tcp', bytes: 1000, connections: 1 }],
  top_countries: [{ country: 'AR', bytes: 1000, hosts: 1 }],
  alerts: [{ rule_id: 'volume', severity: 'medium', title: 'Pico de volumen' }],
  health: {
    capture_status: 'ok',
    packets_seen: 100,
    packets_dropped: 0,
    parse_errors: 0,
    spool_bytes: 0,
  },
};

const validOutput = {
  summary: 'Tráfico dominado por HTTPS saliente.',
  risk_level: 'low',
  findings: [{ type: 'volume_anomaly', description: 'Volumen dentro de parámetros', severity: 'low' }],
  recommendations: ['Mantener observación.'],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getModelChain', () => {
  it('usa AI_MODELS cuando está definido', () => {
    vi.stubEnv('AI_MODELS', 'a, b ,c');
    expect(getModelChain()).toEqual(['a', 'b', 'c']);
    vi.unstubAllEnvs();
  });

  it('cae a defaults :free cuando AI_MODELS no está definido', () => {
    vi.stubEnv('AI_MODELS', '');
    expect(getModelChain()).toEqual([...DEFAULT_AI_MODELS]);
    vi.unstubAllEnvs();
  });
});

describe('presupuesto de salida (Fase 1)', () => {
  it('el peor caso permitido por el schema entra en AI_OUTPUT_MAX_TOKENS', () => {
    const worstCase = {
      summary: 's'.repeat(1500),
      risk_level: 'critical' as const,
      findings: Array.from({ length: 10 }, (_, index) => ({
        type: `finding_${index}`,
        description: 'd'.repeat(400),
        severity: 'high' as const,
      })),
      recommendations: Array.from({ length: 10 }, () => 'r'.repeat(500)),
    };

    expect(AiOutputSchema.safeParse(worstCase).success).toBe(true);

    // El JSON completo tiene que caber en el tope de tokens: si no, Groq
    // responde 400 `json_validate_failed` por truncamiento.
    const estimatedTokens = Math.ceil(JSON.stringify(worstCase).length / 4);
    expect(estimatedTokens).toBeLessThan(AI_OUTPUT_MAX_TOKENS);
    expect(AI_OUTPUT_MAX_TOKENS).toBeGreaterThanOrEqual(3000);
  });
});

describe('extractJsonObject', () => {
  it('extrae JSON dentro de fences ```json', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('extrae JSON rodeado de texto suelto', () => {
    expect(extractJsonObject('aquí: {"a":2} listo')).toEqual({ a: 2 });
  });
  it('devuelve null ante JSON inválido', () => {
    expect(extractJsonObject('no json')).toBeNull();
  });
});

describe('callOpenRouterChain', () => {
  it('devuelve ok con un modelo que responde JSON válido', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: JSON.stringify(validOutput) } }] })
    );
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['m1', 'm2'],
    });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('m1');
    expect(result.output?.summary).toContain('HTTPS');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('registra el modelo real que devuelve el router (openrouter/free)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: 'upstage/solar-pro-3:free',
        choices: [{ message: { content: JSON.stringify(validOutput) } }],
      })
    );
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['openrouter/free'],
    });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('upstage/solar-pro-3:free');
  });

  it('cae al siguiente modelo ante 5xx y certifica riesgo degradado', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: JSON.stringify(validOutput) } }] })
      );
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['m1', 'm2', 'm3'],
    });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('m2');
  });

  it('reintenta ante 503 con backoff antes de rendir el modelo (Fase 4)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: JSON.stringify(validOutput) } }] })
      );
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['m1'],
      retryDelaysMs: [0, 0],
    });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('m1');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('ante un 500 (no 503) pasa directo al siguiente modelo, sin retry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: JSON.stringify(validOutput) } }] })
      );
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['m1', 'm2'],
      retryDelaysMs: [0, 0],
    });
    expect(result.ok).toBe(true);
    expect(result.model).toBe('m2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('registra los headers x-ratelimit-* de la respuesta (Fase 4)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(validOutput) } }] }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-ratelimit-remaining-requests': '7',
          'x-ratelimit-remaining-tokens': '8000',
        },
      }
    );
    const fetchImpl = vi.fn().mockResolvedValue(response);

    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['m1'],
    });

    expect(result.ok).toBe(true);
    const logged = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('"event":"ai_ratelimit"');
    expect(logged).toContain('"provider":"openrouter"');
    expect(logged).toContain('"x-ratelimit-remaining-requests":"7"');
    expect(logged).toContain('"x-ratelimit-remaining-tokens":"8000"');
    log.mockRestore();
  });

  it('loguea ai_call con tokens y latencia (Fase 4)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: 'openrouter/free',
        choices: [{ message: { content: JSON.stringify(validOutput) } }],
        usage: { prompt_tokens: 1200, completion_tokens: 350 },
      })
    );

    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['openrouter/free'],
    });

    expect(result.ok).toBe(true);
    const logged = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('"event":"ai_call"');
    expect(logged).toContain('"provider":"openrouter"');
    expect(logged).toContain('"input_tokens":1200');
    expect(logged).toContain('"output_tokens":350');
    expect(logged).toMatch(/"latency_ms":\d+/);
    log.mockRestore();
  });

  it('devuelve degraded cuando todos los modelos fallan', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['m1', 'm2'],
    });
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('devuelve degraded ante JSON inválido en el cuerpo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'no-json-here' } }] })
    );
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      models: ['m1'],
    });
    expect(result.ok).toBe(false);
  });

  it('sin OPENROUTER_API_KEY no llama a la red y degrada', async () => {
    const fetchImpl = vi.fn();
    const result = await callOpenRouterChain(facts, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: '',
      models: ['m1'],
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
