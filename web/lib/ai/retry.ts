// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Backoff exponencial ante 5xx transitorios (Fase 4): 1 s el primer reintento,
// 2 s el segundo. Muy común en capas gratuitas bajo carga (gemini 503
// "high demand", openrouter 503 del router). El 429 NO entra aquí: eso lo
// maneja el cooldown de rate-limit.ts.

/** Esperas entre reintentos, en orden. Fuera de este arreglo no se reintenta. */
export const SERVER_ERROR_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000];

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
