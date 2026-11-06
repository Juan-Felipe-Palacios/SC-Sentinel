// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// API pública de la capa de IA (§11).

import { fetchAiFacts } from './facts';
import type { QueryDb } from '@/lib/query/db-rows';
import { runAnalysisPipeline } from './analyze';
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
  callAiChain,
  callGeminiChain,
  callGroqChain,
  geminiApiKey,
  getModelsFor,
  resolveProvider,
  type AiProvider,
} from './providers';
export { canonicalJson, factsHash } from './hash';
export { fetchAiFacts, type AiFacts } from './facts';

export async function runAiPipeline(
  deviceId: string,
  database?: QueryDb,
  language: AiLanguage = 'es'
) {
  const facts = await fetchAiFacts(deviceId, database);
  return runAnalysisPipeline(facts, deviceId, database, language);
}
