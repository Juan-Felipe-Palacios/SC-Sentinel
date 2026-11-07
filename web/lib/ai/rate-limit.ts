// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Cuotas free de los proveedores (§11): detección de 429 y cooldown por proveedor.
//
// Groq/Gemini/OpenRouter devuelven `Retry-After` y `x-ratelimit-*`; cuando la
// cuota se agota marcamos al proveedor en cooldown y la cadena pasa al
// siguiente en lugar de devolver un error al usuario.
// El estado vive en memoria por instancia (serverless): mitiga el golpe, no es
// una cuota global. Si todas las instancias coinciden en el mismo orden, el
// efecto es suficiente.

/** Cooldown por defecto cuando el proveedor no envía `Retry-After` (TPM ~60 s). */
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;
/** Tope de cooldown: no enfríamos un proveedor por una ventana diaria entera. */
export const MAX_RATE_LIMIT_COOLDOWN_MS = 300_000;

const cooldowns = new Map<string, number>();

/** ¿El error corresponde a un rate limit del proveedor (429)? */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const status = candidate.status ?? candidate.statusCode;
  if (status === 429) return true;
  if (candidate.code === 429 || candidate.code === '429') return true;

  const name = typeof candidate.name === 'string' ? candidate.name : '';
  if (/TooManyRequests|RateLimit/i.test(name)) return true;

  const message = typeof candidate.message === 'string' ? candidate.message : '';
  // Ojo: no matchear "rate limited" genérico (los tests usan ese texto como
  // error normal). Solo los códigos/códigos de error reales de los proveedores.
  return /rate_limit_exceeded|RESOURCE_EXHAUSTED|\b429\b/.test(message);
}

/** `Retry-After` en segundos (numérico o fecha HTTP) o null si no aplica. */
export function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  return null;
}

/** Intenta leer `Retry-After` de errores lanzados por los SDKs. */
export function retryAfterFromError(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    retryAfterSeconds?: unknown;
    headers?: unknown;
    response?: { headers?: unknown };
  };
  if (typeof candidate.retryAfterSeconds === 'number') return candidate.retryAfterSeconds;

  const fromHeaders = (headers: unknown): number | null => {
    if (!headers || typeof headers !== 'object') return null;
    const bag = headers as Record<string, unknown>;
    const getter = bag['get'];
    const raw =
      bag['retry-after'] ??
      bag['Retry-After'] ??
      (typeof getter === 'function'
        ? (getter as (name: string) => unknown).call(headers, 'retry-after')
        : undefined);
    if (typeof raw === 'string') return parseRetryAfter(raw);
    if (typeof raw === 'number') return raw;
    return null;
  };

  return fromHeaders(candidate.headers) ?? fromHeaders(candidate.response?.headers);
}

/**
 * Marca a un proveedor (o modelo) en cooldown tras un 429.
 * `retryAfterSeconds` del proveedor manda; si no viene, se usa el default.
 */
export function markRateLimited(
  key: string,
  retryAfterSeconds?: number | null,
  now: number = Date.now()
): void {
  const baseMs =
    retryAfterSeconds && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  const durationMs = Math.min(Math.max(baseMs, 1_000), MAX_RATE_LIMIT_COOLDOWN_MS);
  const until = now + durationMs;
  const previous = cooldowns.get(key) ?? 0;
  if (until > previous) cooldowns.set(key, until);

  console.warn(
    JSON.stringify({
      event: 'ai_rate_limited',
      target: key,
      cooldown_ms: until - now,
      retry_after_s: retryAfterSeconds ?? null,
    })
  );
}

/** ¿Está el proveedor todavía en cooldown? Limpia las entradas vencidas. */
export function isCooling(key: string, now: number = Date.now()): boolean {
  const until = cooldowns.get(key);
  if (until === undefined) return false;
  if (until <= now) {
    cooldowns.delete(key);
    return false;
  }
  return true;
}

/** Solo para tests: limpia el estado en memoria. */
export function resetRateLimits(): void {
  cooldowns.clear();
}

/** Headers útiles de cuota presentes en la respuesta (diagnóstico, sin secretos). */
export function rateLimitHeaders(response: Response): Record<string, string> {
  const names = [
    'retry-after',
    'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-reset-requests',
    'x-ratelimit-limit-tokens',
    'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-tokens',
  ];
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = response.headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}
