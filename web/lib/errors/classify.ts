// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Clasificación operativa de errores para logs y respuestas públicas.
//
// Solo se registra el código; nunca el mensaje completo, la URL ni el payload.
// Los cuerpos externos siguen siendo genéricos.

export type OperationalErrorCode =
  | 'db_unavailable'
  | 'db_quota'
  | 'ai_provider_error'
  | 'ai_rate_limited'
  | 'ai_budget_exceeded'
  | 'invalid_model_output'
  | 'timeout'
  | 'internal_error';

function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error ?? '').toLowerCase();
  const cause = (error as { cause?: unknown }).cause;
  const base = `${error.name}: ${error.message}`;
  if (cause instanceof Error) return `${base} | ${cause.name}: ${cause.message}`.toLowerCase();
  if (cause != null) return `${base} | ${String(cause)}`.toLowerCase();
  return base.toLowerCase();
}

function codeOf(error: unknown): string {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

/** Extrae el status HTTP del error si lo expone (Neon driver, fetch, etc.). */
function httpStatusOf(error: unknown): number | null {
  const e = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown }; cause?: { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } } | null;
  const candidates = [e?.status, e?.statusCode, e?.response?.status, e?.cause?.status, e?.cause?.statusCode, e?.cause?.response?.status];
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d{3}$/.test(v)) return Number(v);
  }
  return null;
}

/**
 * Mapea un error de base, proveedor de IA o timeout a un código estable.
 * El orden importa: cuota y conexión de base antes que errores genéricos.
 */
export function classifyOperationalError(error: unknown): OperationalErrorCode {
  const message = messageOf(error);
  const code = codeOf(error);
  const combined = `${code} ${message}`;

  // Neon: cuota de CU-horas, storage o proyecto suspendido, o HTTP 402 del driver.
  const httpStatus = httpStatusOf(error);
  if (httpStatus === 402) {
    return 'db_quota';
  }
  if (
    /quota|cu[-_ ]?hours?|compute time|usage limit|storage limit|project.*suspend|suspend.*project|exceeded.*limit|payment required|http 402|\b402\b/.test(
      combined
    )
  ) {
    return 'db_quota';
  }

  // Timeouts explícitos (fetch, AbortSignal, driver).
  if (
    /timeout|timed out|etimedout|aborterror|aborted|timeout_error|statement timeout|idle timeout/.test(
      combined
    )
  ) {
    return 'timeout';
  }

  // Cuota/rate limit del proveedor de IA.
  if (/rate.?limit|too many requests|\b429\b/.test(combined)) {
    return 'ai_rate_limited';
  }

  // Presupuesto diario propio.
  if (/budget|daily call|presupuesto/.test(combined)) {
    return 'ai_budget_exceeded';
  }

  // Salida del modelo inválida o JSON truncado.
  if (
    /invalid[_\s-]?(json|output)|json[_\s-]?(invalid|parse)|json_validate_failed|schema.*(invalid|fail)|empty_content/.test(
      combined
    )
  ) {
    return 'invalid_model_output';
  }

  // Errores de proveedor de IA (API key, modelo inexistente, 4xx/5xx del proveedor).
  if (
    /provider|api key|api_key|model.*(not found|does not exist)|unauthorized|forbidden|openrouter|gemini|groq|anthropic|openai/.test(
      combined
    )
  ) {
    return 'ai_provider_error';
  }

  // Base inaccesible: DNS, conexión rechazada, pool agotado, arranque de Neon,
  // o HTTP 5xx del driver (Neon no disponible temporalmente).
  if (httpStatus !== null && httpStatus >= 500 && httpStatus < 600) {
    return 'db_unavailable';
  }
  if (
    /econnrefused|enotfound|eai_again|econnreset|epipe|08006|08001|08004|57p01|57p03|53300|3d000|connection|connect timeout|failed to connect|fetch failed|neondberror|neon.*error/.test(
      combined
    )
  ) {
    return 'db_unavailable';
  }

  return 'internal_error';
}

/** `true` cuando el fallo es de infraestructura y conviene responder 503. */
export function isUnavailableCode(code: OperationalErrorCode): boolean {
  return code === 'db_unavailable' || code === 'db_quota' || code === 'timeout';
}
