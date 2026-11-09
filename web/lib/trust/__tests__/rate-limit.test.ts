// web/lib/trust/__tests__/rate-limit.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { checkTrustRateLimit } from '@/lib/trust/rate-limit';

describe('checkTrustRateLimit', () => {
  it('permite los 100 accesos por hora y bloquea el 101', () => {
    const key = `test-${Date.now()}`;
    for (let i = 0; i < 100; i += 1) {
      expect(checkTrustRateLimit(key).allowed).toBe(true);
    }
    const blocked = checkTrustRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
