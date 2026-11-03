// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// ADR-0011: Rate-limit de drenaje — token bucket 60 req/min por device (burst 30)

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup stale buckets periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets.entries()) {
    if (now - b.lastRefillMs > 300_000) {
      buckets.delete(key);
    }
  }
}, 600_000).unref?.();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Check rate limit for a given key (device_id or IP).
 * @param key Identifier for the bucket
 * @param ratePerMinute Refill rate per minute (default: 60)
 * @param burstCapacity Maximum burst tokens (default: 30)
 */
export function checkRateLimit(
  key: string,
  ratePerMinute: number = 60,
  burstCapacity: number = 30
): RateLimitResult {
  const now = Date.now();
  const fillRatePerMs = ratePerMinute / 60_000;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: burstCapacity - 1, lastRefillMs: now };
    buckets.set(key, bucket);
    return { allowed: true };
  }

  // Refill tokens based on elapsed time
  const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
  bucket.tokens = Math.min(burstCapacity, bucket.tokens + elapsedMs * fillRatePerMs);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  // Needs wait
  const neededTokens = 1 - bucket.tokens;
  const retryAfterSeconds = Math.ceil(neededTokens / (fillRatePerMs * 1000));

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, retryAfterSeconds),
  };
}

