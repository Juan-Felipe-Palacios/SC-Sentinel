// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Streaming del LLM para el chatbot (Paso 2 del MVP): Groq/OpenRouter vía SSE
// compatible con OpenAI, Gemini vía SDK. Nunca loguea prompts ni claves.

import { GoogleGenAI } from '@google/genai';
import {
  buildProviderChain,
  geminiApiKey,
  getModelsFor,
  resolveProvider,
  type AiProvider,
  type ProviderEntry,
} from '@/lib/ai/providers';
import {
  isCooling,
  isRateLimitError,
  markRateLimited,
  parseRetryAfter,
  retryAfterFromError,
} from '@/lib/ai/rate-limit';
import {
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_TOKEN_BUDGET,
  type ChatLlmMessage,
} from './types';

export const CHAT_LLM_TIMEOUT_MS = 30_000;

export class ChatLlmError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** Status HTTP del proveedor, cuando aplica. */
    public readonly status?: number,
    /** `Retry-After` reportado por el proveedor (segundos). */
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ChatLlmError';
  }
}

export type ChatStreamChunk =
  | { type: 'delta'; text: string }
  | {
      type: 'usage';
      tokensUsed: number;
      model: string;
      provider: AiProvider;
    };

export interface ChatLlmInit {
  provider?: AiProvider;
  models?: string[];
  /** Override para tests; en producción se toma de process.env. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Límite de salida del proveedor (guest usa 1000). */
  maxOutputTokens?: number;
  /** Tope contable de tokens (guest usa 1000). */
  tokenBudget?: number;
  /** Timeout total del proveedor (guest usa 20 s). */
  timeoutMs?: number;
}

export function resolveChatModelPlan(init: Pick<ChatLlmInit, 'provider' | 'models'> = {}): {
  provider: AiProvider;
  models: string[];
} {
  const provider = init.provider ?? resolveProvider();
  return {
    provider,
    models: init.models && init.models.length > 0 ? init.models : getModelsFor(provider),
  };
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && /abort/i.test(error.name))
  );
}

function numberFrom(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createAbortSignal(
  signal?: AbortSignal,
  timeoutMs: number = CHAT_LLM_TIMEOUT_MS
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('chat_llm_timeout')),
    timeoutMs
  );
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

interface OpenAiSseChunk {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: { total_tokens?: number };
  x_groq?: { usage?: { total_tokens?: number } };
}

/** Parser SSE mínimo para los endpoints OpenAI-compatible. */
async function* readSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<OpenAiSseChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');

        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as unknown;
          if (parsed && typeof parsed === 'object') {
            yield parsed as OpenAiSseChunk;
          }
        } catch {
          // Un chunk malformado no debe cortar toda la respuesta.
        }
      }
    }

    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data) as unknown;
          if (parsed && typeof parsed === 'object') yield parsed as OpenAiSseChunk;
        } catch {
          // Ignorar cola inválida.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamOpenAiCompatible(args: {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: AiProvider;
  messages: ChatLlmMessage[];
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  maxOutputTokens: number;
  tokenBudget: number;
}): AsyncGenerator<ChatStreamChunk> {
  const response = await args.fetchImpl(args.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.3,
      max_tokens: args.maxOutputTokens,
    }),
    signal: args.signal,
  });

  if (!response.ok || !response.body) {
    throw new ChatLlmError(
      'provider_http_error',
      `El proveedor de IA respondió con estado ${response.status}.`,
      response.status,
      parseRetryAfter(response.headers.get('retry-after')) ?? undefined
    );
  }

  let fullText = '';
  let tokensUsed: number | null = null;

  for await (const event of readSseStream(response.body)) {
    const delta = event.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      fullText += delta;
      yield { type: 'delta', text: delta };
    }

    const usage =
      numberFrom(event.usage?.total_tokens) ??
      numberFrom(event.x_groq?.usage?.total_tokens);
    if (usage !== null) tokensUsed = usage;
  }

  yield {
    type: 'usage',
    tokensUsed: Math.min(
      args.tokenBudget,
      tokensUsed ?? estimateTokens(fullText)
    ),
    model: args.model,
    provider: args.provider,
  };
}

interface GeminiChunk {
  text?: string | (() => string);
  usageMetadata?: { totalTokenCount?: number };
}

interface GeminiStreamClient {
  models: {
    generateContentStream: (
      args: Record<string, unknown>
    ) => Promise<AsyncIterable<GeminiChunk>>;
  };
}

async function* streamGemini(args: {
  apiKey: string;
  model: string;
  messages: ChatLlmMessage[];
  signal: AbortSignal;
  maxOutputTokens: number;
  tokenBudget: number;
}): AsyncGenerator<ChatStreamChunk> {
  const client = new GoogleGenAI({ apiKey: args.apiKey }) as unknown as GeminiStreamClient;
  const systemInstruction = args.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const contents = args.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

  const stream = await client.models.generateContentStream({
    model: args.model,
    contents,
    config: {
      systemInstruction,
      temperature: 0.3,
      maxOutputTokens: args.maxOutputTokens,
      abortSignal: args.signal,
    },
  });

  let fullText = '';
  let tokensUsed: number | null = null;

  for await (const chunk of stream) {
    const raw = typeof chunk.text === 'function' ? chunk.text() : chunk.text;
    if (typeof raw === 'string' && raw.length > 0) {
      fullText += raw;
      yield { type: 'delta', text: raw };
    }
    const usage = numberFrom(chunk.usageMetadata?.totalTokenCount);
    if (usage !== null) tokensUsed = usage;
  }

  yield {
    type: 'usage',
    tokensUsed: Math.min(
      args.tokenBudget,
      tokensUsed ?? estimateTokens(fullText)
    ),
    model: args.model,
    provider: 'gemini',
  };
}

function providerKey(provider: AiProvider, override?: string): string | undefined {
  if (override) return override;
  switch (provider) {
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'gemini':
      return geminiApiKey();
    default:
      return process.env.OPENROUTER_API_KEY;
  }
}

function providerEndpoint(provider: AiProvider): string {
  return provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
}

function buildChatChain(init: Pick<ChatLlmInit, 'provider' | 'models'>): ProviderEntry[] {
  // `init.provider` ancla la cadena a un solo proveedor (tests / overrides);
  // sin explícito se recorre la cadena multi-proveedor con respaldo.
  if (init.provider) {
    return [
      {
        provider: init.provider,
        models:
          init.models && init.models.length > 0 ? init.models : getModelsFor(init.provider),
      },
    ];
  }
  return buildProviderChain({ models: init.models });
}

/**
 * Genera la respuesta del asistente. Emite `delta` durante el stream y un
 * último evento `usage` con el modelo efectivo y los tokens consumidos.
 * Ante un 429 marca al proveedor en cooldown y sigue con el siguiente de la
 * cadena en lugar de fallar la conversación.
 */
export async function* streamChatCompletion(
  messages: ChatLlmMessage[],
  init: ChatLlmInit = {}
): AsyncGenerator<ChatStreamChunk> {
  const chain = buildChatChain(init);
  const fetchImpl = init.fetchImpl ?? globalThis.fetch;

  const { signal, cleanup } = createAbortSignal(init.signal, init.timeoutMs);
  const maxOutputTokens = init.maxOutputTokens ?? CHAT_MAX_OUTPUT_TOKENS;
  const tokenBudget = init.tokenBudget ?? CHAT_TOKEN_BUDGET;

  let lastError: unknown = null;
  let missingKey = false;
  let rateLimited = false;
  let coolingSkipped = false;

  try {
    for (const entry of chain) {
      if (isCooling(entry.provider)) {
        coolingSkipped = true;
        continue;
      }

      // El override explícito de key aplica al primer eslabón (el primario).
      const apiKey = providerKey(entry.provider, entry === chain[0] ? init.apiKey : undefined);
      if (!apiKey) {
        missingKey = true;
        continue;
      }

      for (const model of entry.models) {
        let emitted = false;
        try {
          const stream =
            entry.provider === 'gemini'
              ? streamGemini({
                  apiKey,
                  model,
                  messages,
                  signal,
                  maxOutputTokens,
                  tokenBudget,
                })
              : streamOpenAiCompatible({
                  endpoint: providerEndpoint(entry.provider),
                  apiKey,
                  model,
                  provider: entry.provider,
                  messages,
                  fetchImpl,
                  signal,
                  maxOutputTokens,
                  tokenBudget,
                });

          for await (const chunk of stream) {
            // Si ya salió texto no podemos cambiar de modelo a mitad de
            // respuesta: se aborta en lugar de repetir el inicio.
            if (chunk.type === 'delta') emitted = true;
            yield chunk;
          }
          return;
        } catch (error) {
          if (isAbortError(error) || emitted) throw error;
          lastError = error;

          const status = error instanceof ChatLlmError ? error.status : undefined;
          if (status === 429 || isRateLimitError(error)) {
            rateLimited = true;
            markRateLimited(
              entry.provider,
              error instanceof ChatLlmError
                ? error.retryAfterSeconds
                : retryAfterFromError(error)
            );
            break; // cuota agotada: salta al siguiente proveedor
          }
        }
      }
    }

    const lastIsRateLimit =
      lastError !== null &&
      (lastError instanceof ChatLlmError
        ? lastError.status === 429
        : isRateLimitError(lastError));

    if ((rateLimited || coolingSkipped) && (lastError === null || lastIsRateLimit)) {
      throw new ChatLlmError(
        'rate_limited',
        'Los proveedores de IA están en pausa por límite de consumo. Probá de nuevo en unos segundos.'
      );
    }
    if (lastError) {
      throw lastError instanceof Error
        ? lastError
        : new ChatLlmError('provider_error', 'No se pudo obtener respuesta del proveedor de IA.');
    }
    if (missingKey) {
      throw new ChatLlmError(
        'missing_api_key',
        `Falta la API key del proveedor de IA (${chain[0]?.provider ?? resolveProvider()}).`
      );
    }
    throw new ChatLlmError('no_models', 'No hay modelos de IA configurados.');
  } finally {
    cleanup();
  }
}
