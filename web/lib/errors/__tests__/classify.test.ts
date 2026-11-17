// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import { classifyOperationalError, isUnavailableCode } from '@/lib/errors/classify';

describe('classifyOperationalError', () => {
  it('clasifica cuota de Neon', () => {
    expect(classifyOperationalError(new Error('project suspended: compute time quota exceeded'))).toBe(
      'db_quota'
    );
  });

  it('clasifica base inaccesible', () => {
    const error = Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
    expect(classifyOperationalError(error)).toBe('db_unavailable');
    expect(isUnavailableCode('db_unavailable')).toBe(true);
  });

  it('clasifica timeouts antes que errores genéricos', () => {
    expect(classifyOperationalError(new Error('TimeoutError: statement timeout'))).toBe('timeout');
    expect(isUnavailableCode('timeout')).toBe(true);
  });

  it('clasifica rate limit y proveedor de IA', () => {
    expect(classifyOperationalError(new Error('429 Too Many Requests'))).toBe('ai_rate_limited');
    expect(classifyOperationalError(new Error('Gemini: model not found'))).toBe(
      'ai_provider_error'
    );
  });

  it('clasifica salida inválida del modelo y presupuesto', () => {
    expect(classifyOperationalError(new Error('invalid output: json_validate_failed'))).toBe(
      'invalid_model_output'
    );
    expect(classifyOperationalError(new Error('daily call budget exhausted'))).toBe(
      'ai_budget_exceeded'
    );
  });

  it('deja internal_error para fallos desconocidos', () => {
    expect(classifyOperationalError(new Error('boom'))).toBe('internal_error');
    expect(isUnavailableCode('internal_error')).toBe(false);
  });
});
