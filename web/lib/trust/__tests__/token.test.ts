// web/lib/trust/__tests__/token.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { generateTrustToken, hashTrustToken, trustTokensMatch } from '@/lib/trust/token';

describe('generateTrustToken', () => {
  it('genera tokens de 43 caracteres base64url únicos', () => {
    const a = generateTrustToken();
    const b = generateTrustToken();
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe('hashTrustToken', () => {
  it('es determinista y distinto para tokens distintos', () => {
    expect(hashTrustToken('token-fijo-de-test')).toBe(hashTrustToken('token-fijo-de-test'));
    expect(hashTrustToken('token-fijo-de-test')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('trustTokensMatch', () => {
  it('acepta el token correcto y rechaza otros', () => {
    const token = generateTrustToken();
    expect(trustTokensMatch(hashTrustToken(token), token)).toBe(true);
    expect(trustTokensMatch(hashTrustToken(token), 'token-incorrecto')).toBe(false);
  });
});
