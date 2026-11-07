// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Selección de proveedor de IA (§11): OpenRouter, Google Gemini o Groq.
// Cada proveedor devuelve el mismo `AiChainResult` con el JSON ya validado.

import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import type { AiFacts } from './facts';
import {
  isCooling,
  isRateLimitError,
  markRateLimited,
  retryAfterFromError,
} from './rate-limit';
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

export interface ProviderEntry {
  provider: AiProvider;
  models: string[];
}

/**
 * Orden de respaldo cuando el proveedor primario no está disponible o está en
 * cooldown por cuota: Gemini (cuota free más holgada) → OpenRouter (router de
 * modelos `:free`, muchos upstreams) → Groq (cuota chica: último recurso).
 */
export const PROVIDER_FALLBACK_ORDER: readonly AiProvider[] = [
  'gemini',
  'openrouter',
  'groq',
];

function hasProviderKey(provider: AiProvider, env: NodeJS.ProcessEnv): boolean {
  switch (provider) {
    case 'gemini':
      return Boolean(geminiApiKey(env));
    case 'groq':
      return Boolean(env.GROQ_API_KEY);
    default:
      return Boolean(env.OPENROUTER_API_KEY);
  }
}

export interface ProviderChainOptions {
  env?: NodeJS.ProcessEnv;
  /** Modelos para el primer eslabón (override o `AI_MODELS`). */
  models?: string[];
  /** Proveedores a incluir aunque no haya key en env (clients inyectados). */
  forcedProviders?: AiProvider[];
}

/**
 * Cadena de proveedores con key disponible, empezando por el primario
 * (`AI_PROVIDER` o detección). Cada eslabón usa los defaults de SU proveedor:
 * `AI_MODELS` solo aplica al primario para no mandar modelos de un proveedor
 * a la API de otro.
 */
export function buildProviderChain(options: ProviderChainOptions = {}): ProviderEntry[] {
  const env = options.env ?? process.env;
  const primary = resolveProvider(env);
  const ordered = [primary, ...PROVIDER_FALLBACK_ORDER.filter((p) => p !== primary)];
  const forced = new Set(options.forcedProviders ?? []);

  const chain: ProviderEntry[] = [];
  for (const provider of ordered) {
    if (chain.length > 0 && !hasProviderKey(provider, env) && !forced.has(provider)) {
      continue;
    }
    const models =
      chain.length === 0
        ? options.models && options.models.length > 0
          ? options.models
          : getModelsFor(provider, env)
        : [...PROVIDER_DEFAULT_MODELS[provider]];
    chain.push({ provider, models });
  }
  return chain;
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
  let rateLimited = false;
  let retryAfterSeconds: number | null = null;

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
      if (isRateLimitError(error)) {
        rateLimited = true;
        retryAfterSeconds = retryAfterFromError(error);
      }
    }
  }

  console.warn(JSON.stringify({ event: 'ai_chain_failed', provider: 'gemini', attempts }));
  return { ok: false, model: null, output: null, rateLimited, retryAfterSeconds };
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
  let rateLimited = false;
  let retryAfterSeconds: number | null = null;

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
      if (isRateLimitError(error)) {
        rateLimited = true;
        retryAfterSeconds = retryAfterFromError(error);
      }
    }
  }

  console.warn(JSON.stringify({ event: 'ai_chain_failed', provider: 'groq', attempts }));
  return { ok: false, model: null, output: null, rateLimited, retryAfterSeconds };
}

/** Punto de entrada del pipeline: recorre la cadena de proveedores hasta que
 * uno devuelve JSON válido. Sin `init.provider` explícito usa la cadena
 * multi-proveedor (Fase 2): primario → respaldo, saltando los que estén en
 * cooldown por 429. */
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
  const language = init.language ?? 'es';

  // Clients/keys inyectados en tests: el proveedor debe entrar en la cadena
  // aunque el entorno no tenga su key.
  const forcedProviders: AiProvider[] = [];
  if (init.geminiClient) forcedProviders.push('gemini');
  if (init.groqClient) forcedProviders.push('groq');
  if (init.openRouterApiKey) forcedProviders.push('openrouter');

  const chain: ProviderEntry[] = init.provider
    ? [
        {
          provider: init.provider,
          models:
            init.models && init.models.length > 0
              ? init.models
              : getModelsFor(init.provider),
        },
      ]
    : buildProviderChain({ models: init.models, forcedProviders });

  let rateLimited = false;
  let retryAfterSeconds: number | null = null;

  for (const entry of chain) {
    if (isCooling(entry.provider)) continue;

    let result: AiChainResult;
    switch (entry.provider) {
      case 'gemini':
        result = await callGeminiChain(facts, {
          client: init.geminiClient,
          models: entry.models,
          language,
        });
        break;
      case 'groq':
        result = await callGroqChain(facts, {
          client: init.groqClient,
          models: entry.models,
          language,
        });
        break;
      default:
        result = await callOpenRouterChain(facts, {
          models: entry.models,
          language,
          fetchImpl: init.fetchImpl,
          apiKey: init.openRouterApiKey,
        });
    }

    if (result.ok) return result;

    if (result.rateLimited) {
      rateLimited = true;
      retryAfterSeconds = result.retryAfterSeconds ?? retryAfterSeconds;
      markRateLimited(entry.provider, result.retryAfterSeconds);
    }
  }

  if (chain.length === 0 || chain.every((entry) => isCooling(entry.provider))) {
    console.warn(
      JSON.stringify({
        event: 'ai_chain_failed',
        reason: 'all_providers_cooling',
        chain: chain.map((entry) => entry.provider),
      })
    );
  }

  return { ok: false, model: null, output: null, rateLimited, retryAfterSeconds };
}

export const AI_REQUEST_TIMEOUT_MS = AI_TIMEOUT_MS;
