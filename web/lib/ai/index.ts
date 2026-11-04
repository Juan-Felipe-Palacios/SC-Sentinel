// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// API pública de la capa de IA (§11).

import { fetchAiFacts } from './facts';
import type { QueryDb } from '@/lib/query/db-rows';
import { runAnalysisPipeline } from './analyze';

export {
  AiOutputSchema,
  callOpenRouterChain,
  DEFAULT_AI_MODELS,
  extractJsonObject,
  getModelChain,
  AI_TIMEOUT_MS,
} from './openrouter';
export { canonicalJson, factsHash } from './hash';
export { fetchAiFacts, type AiFacts } from './facts';

export async function runAiPipeline(deviceId: string, database?: QueryDb) {
  const facts = await fetchAiFacts(deviceId, database);
  return runAnalysisPipeline(facts, deviceId, database);
}
