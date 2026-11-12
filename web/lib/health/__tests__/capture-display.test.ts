// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Fija el mapeo que ve el panel: `disabled` es modo colector, no "sin datos".

import { describe, expect, it } from 'vitest';
import {
  captureStatusOf,
  displayStatusOf,
  isStale,
  STALE_AFTER_MS,
} from '../capture-display';

describe('captureStatusOf', () => {
  it('reconoce disabled como modo colector', () => {
    expect(captureStatusOf('disabled')).toBe('disabled');
    expect(captureStatusOf('DISABLED')).toBe('disabled');
  });

  it('mantiene los estados del agente', () => {
    expect(captureStatusOf('ok')).toBe('ok');
    expect(captureStatusOf('degraded')).toBe('degraded');
    expect(captureStatusOf('error')).toBe('error');
  });

  it('lo desconocido no se disfraza de captura en línea', () => {
    expect(captureStatusOf(null)).toBe('unknown');
    expect(captureStatusOf('')).toBe('unknown');
    expect(captureStatusOf('collector-only')).toBe('unknown');
  });
});

describe('displayStatusOf', () => {
  const now = Date.parse('2026-11-12T22:00:00.000Z');

  it('disabled fresco sigue siendo disabled', () => {
    expect(displayStatusOf('disabled', '2026-11-12T21:59:00.000Z', now)).toBe('disabled');
  });

  it('sin señal reciente manda stale sobre disabled', () => {
    const old = new Date(now - STALE_AFTER_MS - 1_000).toISOString();
    expect(displayStatusOf('disabled', old, now)).toBe('stale');
  });

  it('sin timestamp no se inventa stale', () => {
    expect(isStale(null, now)).toBe(false);
    expect(isStale('no-es-fecha', now)).toBe(false);
    expect(displayStatusOf('ok', null, now)).toBe('ok');
  });
});
