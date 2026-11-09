// web/lib/trust/token.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateTrustToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTrustToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function trustTokensMatch(storedHash: string, token: string): boolean {
  const candidate = Buffer.from(hashTrustToken(token), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
