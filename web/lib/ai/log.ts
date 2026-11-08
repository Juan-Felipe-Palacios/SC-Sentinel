// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Logging estructurado de llamadas IA (Fase 4): una línea JSON por evento,
// sin secretos ni payloads. Los tokens son null cuando el proveedor no los
// expone (fixtures de tests o respuestas sin `usage`).

import { rateLimitHeaders } from './rate-limit';

export interface AiCallLogEntry {
  provider: string;
  model: string | null;
  ok: boolean;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms?: number | null;
}

/** Éxito de una llamada: proveedor, modelo, tokens, latencia. */
export function logAiCall(entry: AiCallLogEntry): void {
  console.log(JSON.stringify({ event: 'ai_call', ...entry }));
}

/**
 * Registra los headers `x-ratelimit-*` de una respuesta para anticipar un 429
 * antes de que ocurra. Solo loguea si la respuesta trae alguno de esos headers.
 */
export function logRateLimitHeaders(provider: string, model: string, response: Response): void {
  const headers = rateLimitHeaders(response);
  if (Object.keys(headers).length > 0) {
    console.log(JSON.stringify({ event: 'ai_ratelimit', provider, model, headers }));
  }
}
