// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// API pública de la capa de IA (§11).

import { fetchAiFacts } from './facts';
import type { QueryDb } from '@/lib/query/db-rows';
import { runAnalysisPipeline, type RunAnalysisOptions } from './analyze';
import type { AiLanguage } from './openrouter';

export {
  AiOutputSchema,
  buildSystemPrompt,
  callOpenRouterChain,
  DEFAULT_AI_MODELS,
  extractJsonObject,
  getModelChain,
  parseAiLanguage,
  AI_TIMEOUT_MS,
  AI_LANGUAGES,
  type AiLanguage,
} from './openrouter';
export {
  AI_REQUEST_TIMEOUT_MS,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_FALLBACK_ORDER,
  buildProviderChain,
  callAiChain,
  callGeminiChain,
  callGroqChain,
  geminiApiKey,
  getModelsFor,
  resolveProvider,
  type AiProvider,
  type ProviderChainOptions,
  type ProviderEntry,
} from './providers';
export {
  DEFAULT_RATE_LIMIT_COOLDOWN_MS,
  isCooling,
  isRateLimitError,
  markRateLimited,
  parseRetryAfter,
  resetRateLimits,
} from './rate-limit';
export { canonicalJson, factsHash } from './hash';
export { AI_CRON_MIN_INTERVAL_MS } from './analyze';
export type { RunAnalysisOptions } from './analyze';
export { fetchAiFacts, type AiFacts } from './facts';

export async function runAiPipeline(
  deviceId: string,
  database?: QueryDb,
  language: AiLanguage = 'es',
  options: RunAnalysisOptions = {}
) {
  const facts = await fetchAiFacts(deviceId, database);
  return runAnalysisPipeline(facts, deviceId, database, language, options);
}
