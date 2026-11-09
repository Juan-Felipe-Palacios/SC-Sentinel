// web/lib/trust/rate-limit.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { checkRateLimit } from '@/lib/rate-limit/ingest';

export const TRUST_REQUESTS_PER_HOUR = 100;
export const TRUST_BURST = 100;

export function checkTrustRateLimit(tokenHash: string): { allowed: boolean; retryAfterSeconds?: number } {
  return checkRateLimit(`trust:req:${tokenHash}`, TRUST_REQUESTS_PER_HOUR / 60, TRUST_BURST);
}
