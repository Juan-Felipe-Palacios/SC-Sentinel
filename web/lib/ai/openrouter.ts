// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Cliente OpenRouter (§11): cadena de fallback 1→2→3→determinista, timeout 30 s, sin logs con payload.

import { z } from 'zod';
import type { AiFacts } from './facts';
import { parseRetryAfter } from './rate-limit';

// Router de modelos gratuitos de OpenRouter: elige uno disponible que soporte
// structured outputs, así que no se rompe cuando retiran un modelo `:free`.
// Se puede sobreescribir con AI_MODELS (lista separada por comas).
export const DEFAULT_AI_MODELS = ['openrouter/free'] as const;

// 1000 tokens era poco: gpt-oss gasta parte del presupuesto en reasoning y el
// JSON se truncaba → Groq respondía 400 `json_validate_failed`. Con 4000 el
// objeto completo (dentro de los topes del schema) entra incluso con reasoning.
export const AI_OUTPUT_MAX_TOKENS = 4000;
export const AI_PROMPT_MAX_TOKENS = 4000;
export const AI_TIMEOUT_MS = 30_000;

/** Idioma de salida del análisis. `es` es el idioma por defecto del producto. */
export type AiLanguage = 'es' | 'en';

export const AI_LANGUAGES: readonly AiLanguage[] = ['es', 'en'];

export function parseAiLanguage(value: unknown): AiLanguage {
  return value === 'en' ? 'en' : 'es';
}

// Topes acotados a lo que un análisis de ventana realmente necesita: con
// topes generosos el JSON pedía más de 4000 tokens y se truncaba.
const AiFindingSchema = z.object({
  type: z.string().min(1).max(64),
  description: z.string().min(1).max(400),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
});

export const AiOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  findings: z.array(AiFindingSchema).max(10),
  recommendations: z.array(z.string().min(1).max(500)).max(10),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;

export interface AiChainResult {
  ok: boolean;
  model: string | null;
  output: AiOutput | null;
  /** true si el intento falló por 429: el proveedor debe entrar en cooldown. */
  rateLimited?: boolean;
  /** `Retry-After` reportado por el proveedor (segundos), si venía. */
  retryAfterSeconds?: number | null;
}

export function getModelChain(): string[] {
  const fromEnv = process.env.AI_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : [...DEFAULT_AI_MODELS];
}

const PROMPT_HEADER = `Sos un analista de seguridad de red. El motor determinista ya analizó las ventanas.
Recibís únicamente HECHOS AGREGADOS (JSON). No hay paquetes crudos.
Cuando top_hosts[].ip no sea null, el agente no anonimizó la IP: nombrala así en el análisis.
Si ip es null, referite al host por su host_key. Nunca inventes nombres de host.
No inventés datos que no estén en el JSON. Si no hay nada notable, decilo con claridad.

En los hechos, country "LAN" significa red local/privada (no es un país) y country null
significa que el host no se pudo geolocalizar: explicá esa distinción y nunca los
describas como "país desconocido".`;

const PROMPT_JSON_SHAPE = `Respondé SOLO un objeto JSON válido (sin markdown, sin texto adicional) con esta forma:
{"summary":"...","risk_level":"low"|"medium"|"high"|"critical","findings":[{"type":"...","description":"...","severity":"info"|"low"|"medium"|"high"|"critical"}],"recommendations":["..."]}`;

const SYSTEM_PROMPTS: Record<AiLanguage, string> = {
  es: `${PROMPT_HEADER}

IDIOMA OBLIGATORIO: español neutro. Los campos "summary", "findings[].description" y
"recommendations[]" van SIEMPRE en español, sin excepciones y sin frases en inglés.
La única excepción es "findings[].type": un slug corto en inglés (traffic, ports, alerts,
host_anonymity, health, capture).
Volvé a escribir todo en español aunque los hechos vengan con nombres en inglés.

${PROMPT_JSON_SHAPE}`,
  en: `${PROMPT_HEADER}

MANDATORY LANGUAGE: neutral English. Write "summary", "findings[].description" and
"recommendations[]" in English only. The only exception is "findings[].type": a short
English slug (traffic, ports, alerts, host_anonymity, health, capture).

${PROMPT_JSON_SHAPE}`,
};

/** Prompt del sistema para el idioma pedido (español por defecto). */
export function buildSystemPrompt(language: AiLanguage = 'es'): string {
  return SYSTEM_PROMPTS[language] ?? SYSTEM_PROMPTS.es;
}

/** Prompt por defecto: español, el idioma del producto. */
export const SYSTEM_PROMPT = buildSystemPrompt('es');

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
  init: {
    fetchImpl?: typeof fetch;
    apiKey?: string;
    models?: string[];
    language?: AiLanguage;
  } = {}
): Promise<AiChainResult> {
  const apiKey = init.apiKey ?? process.env.OPENROUTER_API_KEY;
  const fetchImpl = init.fetchImpl ?? globalThis.fetch;
  const models = init.models ?? getModelChain();
  const systemPrompt = buildSystemPrompt(init.language ?? 'es');

  if (!apiKey) {
    console.warn(JSON.stringify({ event: 'ai_chain_failed', reason: 'missing_api_key' }));
    return { ok: false, model: null, output: null };
  }

  // Diagnóstico sin secretos: modelo + status HTTP / tipo de error por intento.
  const attempts: Array<{ model: string; status?: number; error?: string }> = [];
  let rateLimited = false;
  let retryAfterSeconds: number | null = null;

  const bodyFor = (model: string) =>
    JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
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
        if (res.status === 429) {
          rateLimited = true;
          retryAfterSeconds = parseRetryAfter(res.headers.get('retry-after'));
        }
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
  return { ok: false, model: null, output: null, rateLimited, retryAfterSeconds };
}
