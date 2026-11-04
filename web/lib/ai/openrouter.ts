// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Cliente OpenRouter (§11): cadena de fallback 1→2→3→determinista, timeout 30 s, sin logs con payload.

import { z } from 'zod';
import type { AiFacts } from './facts';

// Router de modelos gratuitos de OpenRouter: elige uno disponible que soporte
// structured outputs, así que no se rompe cuando retiran un modelo `:free`.
// Se puede sobreescribir con AI_MODELS (lista separada por comas).
export const DEFAULT_AI_MODELS = ['openrouter/free'] as const;

export const AI_OUTPUT_MAX_TOKENS = 1000;
export const AI_PROMPT_MAX_TOKENS = 4000;
export const AI_TIMEOUT_MS = 30_000;

const AiFindingSchema = z.object({
  type: z.string().min(1).max(64),
  description: z.string().min(1).max(1000),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
});

export const AiOutputSchema = z.object({
  summary: z.string().min(1).max(2000),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  findings: z.array(AiFindingSchema).max(20),
  recommendations: z.array(z.string().min(1).max(500)).max(20),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;

export interface AiChainResult {
  ok: boolean;
  model: string | null;
  output: AiOutput | null;
}

export function getModelChain(): string[] {
  const fromEnv = process.env.AI_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : [...DEFAULT_AI_MODELS];
}

export const SYSTEM_PROMPT = `Sos un analista de seguridad de red. El motor determinista ya analizó las ventanas.
Recibís únicamente HECHOS AGREGADOS (JSON). No hay paquetes crudos ni IPs sin anonimizar.
No inventés datos que no estén en el JSON. Si no hay nada notable, decilo con claridad.

Respondé SOLO un objeto JSON válido (sin markdown, sin texto adicional) con esta forma:
{"summary":"...","risk_level":"low"|"medium"|"high"|"critical","findings":[{"type":"...","description":"...","severity":"info"|"low"|"medium"|"high"|"critical"}],"recommendations":["..."]}`;

/** Extrae el primer objeto JSON completo de la respuesta (tolera fences ```json). */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function callOpenRouterChain(
  facts: AiFacts,
  init: { fetchImpl?: typeof fetch; apiKey?: string; models?: string[] } = {}
): Promise<AiChainResult> {
  const apiKey = init.apiKey ?? process.env.OPENROUTER_API_KEY;
  const fetchImpl = init.fetchImpl ?? globalThis.fetch;
  const models = init.models ?? getModelChain();

  if (!apiKey) {
    console.warn(JSON.stringify({ event: 'ai_chain_failed', reason: 'missing_api_key' }));
    return { ok: false, model: null, output: null };
  }

  // Diagnóstico sin secretos: modelo + status HTTP / tipo de error por intento.
  const attempts: Array<{ model: string; status?: number; error?: string }> = [];

  const bodyFor = (model: string) =>
    JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Facts agregados de la última ventana:\n${JSON.stringify(facts)}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: AI_OUTPUT_MAX_TOKENS,
      temperature: 0.2,
    });

  for (const model of models) {
    try {
      const res = await fetchImpl(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: bodyFor(model),
          signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        }
      );
      if (!res.ok) {
        // El cuerpo del error de OpenRouter es corto y no contiene credenciales.
        const detail = await res.text().catch(() => '');
        attempts.push({ model, status: res.status, error: detail.slice(0, 160) });
        continue;
      }
      const payload = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content) {
        attempts.push({ model, status: res.status, error: 'empty_content' });
        continue;
      }
      const parsed = extractJsonObject(content);
      const validated = AiOutputSchema.safeParse(parsed);
      if (!validated.success) {
        attempts.push({ model, status: res.status, error: 'invalid_output' });
        continue;
      }
      // Con un router la respuesta trae el modelo realmente usado ("openrouter/free").
      const usedModel = typeof payload.model === 'string' && payload.model ? payload.model : model;
      return { ok: true, model: usedModel, output: validated.data };
    } catch (error) {
      // Timeout, red o body inválido: probamos el siguiente modelo (§11.3).
      attempts.push({ model, error: error instanceof Error ? error.name : 'unknown_error' });
      continue;
    }
  }

  console.warn(JSON.stringify({ event: 'ai_chain_failed', attempts }));
  return { ok: false, model: null, output: null };
}
