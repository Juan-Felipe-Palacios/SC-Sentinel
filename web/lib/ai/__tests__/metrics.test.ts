// web/lib/ai/__tests__/metrics.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { estimateCostUsd, parsePricing } from '@/lib/ai/metrics';

describe('parsePricing', () => {
  it('parsea AI_PRICING_JSON y tolera entradas inválidas', () => {
    const pricing = parsePricing({ AI_PRICING_JSON: '{"m1":{"inputPerMTok":0.15,"outputPerMTok":0.60},"bad":null}' } as Record<string, string>);
    expect(pricing['m1']).toEqual({ inputPerMTok: 0.15, outputPerMTok: 0.6 });
    expect(pricing['bad']).toBeUndefined();
  });
  it('devuelve vacío sin env o con JSON inválido', () => {
    expect(parsePricing({})).toEqual({});
    expect(parsePricing({ AI_PRICING_JSON: 'no-json' })).toEqual({});
  });
});

describe('estimateCostUsd', () => {
  it('calcula coste por millón de tokens', () => {
    expect(estimateCostUsd('m1', 1_000_000, 500_000, { m1: { inputPerMTok: 0.15, outputPerMTok: 0.6 } })).toBeCloseTo(0.45, 6);
  });
  it('devuelve 0 para modelos free o sin precio', () => {
    expect(estimateCostUsd('openrouter/free', 1000, 1000, {})).toBe(0);
    expect(estimateCostUsd('m1', null, null, { m1: { inputPerMTok: 1, outputPerMTok: 1 } })).toBe(0);
  });
});
