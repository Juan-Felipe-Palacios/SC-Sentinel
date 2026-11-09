// web/lib/trust/__tests__/queries-import.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import * as queries from '@/lib/trust/queries';

describe('trust queries exports', () => {
  it('expone create/list/revoke/rotate/resolve', () => {
    expect(typeof queries.createTrustPage).toBe('function');
    expect(typeof queries.listTrustPages).toBe('function');
    expect(typeof queries.revokeTrustPage).toBe('function');
    expect(typeof queries.rotateTrustPage).toBe('function');
    expect(typeof queries.resolveTrustPage).toBe('function');
  });
});
