// web/lib/trust/__tests__/leak-alert.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { LEAK_THRESHOLD_24H, maybeAlertLeak } from '@/lib/trust/leak-alert';

describe('maybeAlertLeak', () => {
  it('implementa el umbral de 1000 accesos', () => {
    expect(LEAK_THRESHOLD_24H).toBe(1000);
    expect(typeof maybeAlertLeak).toBe('function');
  });
});
