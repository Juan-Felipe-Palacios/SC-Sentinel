// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Selección de proveedor de IA (§11): OpenRouter, Google Gemini o Groq.
// Cada proveedor devuelve el mismo `AiChainResult` con el JSON ya validado.

import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import type { AiFacts } from './facts';
import {
  AI_OUTPUT_MAX_TOKENS,
  AI_TIMEOUT_MS,
  AiOutputSchema,
  buildSystemPrompt,
  callOpenRouterChain,
  extractJsonObject,
  type AiChainResult,
  type AiLanguage,
} from './openrouter';

export type AiProvider = 'openrouter' | 'gemini' | 'groq';

/** Modelos por defecto cuando `AI_MODELS` no está definido. */
export const PROVIDER_DEFAULT_MODELS: Record<AiProvider, readonly string[]> = {
  openrouter: ['openrouter/free'],
  // `gemini-1.5-flash` está retirado; 3.8 Flash es el estable actual con structured outputs.
  gemini: ['gemini-3.8-flash'],
  // Groq retiró Llama 3.1/3.3 del tier self-serve: quedan los GPT-OSS.
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
};

/** `AI_PROVIDER` explícito o detección por la key disponible. */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const explicit = env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === 'openrouter' || explicit === 'gemini' || explicit === 'groq') return explicit;
  if (env.GROQ_API_KEY) return 'groq';
  if (env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY) return 'gemini';
  return 'openrouter';
}

/** Lista de modelos: `AI_MODELS` (coma-separado) o los defaults del proveedor. */
export function getModelsFor(
  provider: AiProvider,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const fromEnv = env.AI_MODELS?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return [...PROVIDER_DEFAULT_MODELS[provider]];
}

export function geminiApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY || undefined;
}

function userPrompt(facts: AiFacts): string {
  return `Facts agregados de la última ventana:\n${JSON.stringify(facts)}`;
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return null;
}

export interface GeminiResponseLike {
  text?: string | (() => string);
}
export interface GeminiModelLike {
  generateContent: (args: { model: string; contents: string; config?: Record<string, unknown> }) => Promise<GeminiResponseLike>;
}
export interface GeminiClientLike {
  models: GeminiModelLike;
}

export interface GroqResponseLike {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
}
export interface GroqClientLike {
  chat: {
    completions: {
      create: (args: Record<string, unknown>) => Promise<GroqResponseLike>;
    };
  };
}

/** Gemini (SDK `@google/genai`): structured outputs nativos vía `responseMimeType`. */
export async function callGeminiChain(
  facts: AiFacts,
  init: {
    client?: GeminiClientLike;
    models?: string[];
    apiKey?: string;
    language?: AiLanguage;
  } = {}
): Promise<AiChainResult> {
  const apiKey = init.apiKey ?? geminiApiKey();
  if (!init.client && !apiKey) {
    console.warn(JSON.stringify({ event: 'ai_chain_failed', provider: 'gemini', reason: 'missing_api_key' }));
    return { ok: false, model: null, output: null };
  }

  const client: GeminiClientLike =
    init.client ?? (new GoogleGenAI({ apiKey }) as unknown as GeminiClientLike);
  const models = init.models ?? getModelsFor('gemini');
  const systemInstruction = buildSystemPrompt(init.language ?? 'es');
  const attempts: Array<{ model: string; status?: number; error?: string }> = [];

  for (const model of models) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: userPrompt(facts),
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: AI_OUTPUT_MAX_TOKENS,
        },
      });
      const raw = typeof response.text === 'function' ? response.text() : response.text;
      const text = textOf(raw);
      if (!text) {
        attempts.push({ model, error: 'empty_content' });
        continue;
      }
      const validated = AiOutputSchema.safeParse(extractJsonObject(text));
      if (!validated.success) {
        attempts.push({ model, error: 'invalid_output' });
        continue;
      }
      return { ok: true, model, output: validated.data };
    } catch (error) {
      attempts.push({ model, error: error instanceof Error ? error.name : 'unknown_error' });
    }
  }

  console.warn(JSON.stringify({ event: 'ai_chain_failed', provider: 'gemini', attempts }));
  return { ok: false, model: null, output: null };
}

/** Groq (SDK `groq-sdk`, compatible con la API de OpenAI): `response_format: json_object`. */
export async function callGroqChain(
  facts: AiFacts,
  init: {
    client?: GroqClientLike;
    models?: string[];
    apiKey?: string;
    language?: AiLanguage;
  } = {}
): Promise<AiChainResult> {
  const apiKey = init.apiKey ?? process.env.GROQ_API_KEY;
  if (!init.client && !apiKey) {
    console.warn(JSON.stringify({ event: 'ai_chain_failed', provider: 'groq', reason: 'missing_api_key' }));
    return { ok: false, model: null, output: null };
  }

  const client: GroqClientLike =
    init.client ?? (new Groq({ apiKey }) as unknown as GroqClientLike);
  const models = init.models ?? getModelsFor('groq');
  const systemPrompt = buildSystemPrompt(init.language ?? 'es');
  const attempts: Array<{ model: string; status?: number; error?: string }> = [];

  for (const model of models) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt(facts) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: AI_OUTPUT_MAX_TOKENS,
      });
      const content = completion.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content) {
        attempts.push({ model, error: 'empty_content' });
        continue;
      }
      const validated = AiOutputSchema.safeParse(extractJsonObject(content));
      if (!validated.success) {
        attempts.push({ model, error: 'invalid_output' });
        continue;
      }
      const usedModel = typeof completion.model === 'string' && completion.model ? completion.model : model;
      return { ok: true, model: usedModel, output: validated.data };
    } catch (error) {
      attempts.push({ model, error: error instanceof Error ? error.name : 'unknown_error' });
    }
  }

  console.warn(JSON.stringify({ event: 'ai_chain_failed', provider: 'groq', attempts }));
  return { ok: false, model: null, output: null };
}

/** Punto de entrada del pipeline: elige el proveedor y aplica su cadena de modelos. */
export async function callAiChain(
  facts: AiFacts,
  init: {
    provider?: AiProvider;
    models?: string[];
    language?: AiLanguage;
    geminiClient?: GeminiClientLike;
    groqClient?: GroqClientLike;
    fetchImpl?: typeof fetch;
    openRouterApiKey?: string;
  } = {}
): Promise<AiChainResult> {
  const provider = init.provider ?? resolveProvider();
  const models = init.models ?? getModelsFor(provider);
  const language = init.language ?? 'es';

  switch (provider) {
    case 'gemini':
      return callGeminiChain(facts, { client: init.geminiClient, models, language });
    case 'groq':
      return callGroqChain(facts, { client: init.groqClient, models, language });
    default:
      return callOpenRouterChain(facts, {
        models,
        language,
        fetchImpl: init.fetchImpl,
        apiKey: init.openRouterApiKey,
      });
  }
}

export const AI_REQUEST_TIMEOUT_MS = AI_TIMEOUT_MS;
