import { describe, expect, it, vi } from 'vitest';
import {
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
