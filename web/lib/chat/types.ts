// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Contrato interno del Security Chatbot (M3.5): contexto RAG, historial y SSE.

export const CHAT_MAX_MESSAGE_LENGTH = 2000;
export const CHAT_MAX_CONTEXT_MESSAGES = 12;
export const CHAT_HISTORY_LIMIT = 20;
export const CHAT_MAX_OUTPUT_TOKENS = 1200;
export const CHAT_TOKEN_BUDGET = 2000;
export const CHAT_CONTEXT_HOURS = 24;

export type ChatRole = 'user' | 'assistant';

export type ChatQueryType = 'traffic' | 'hosts' | 'alerts' | 'health' | 'general';

export interface ChatTopHost {
  hostKey: string;
  ip: string | null;
  country: string | null;
  bytes: number;
  packets: number;
}

export interface ChatTopPort {
  port: number;
  protocol: string;
  bytes: number;
  connections: number;
}

export interface ChatTopCountry {
  country: string;
  bytes: number;
  hosts: number;
}

export interface ChatAlert {
  id: string;
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  createdAt: string | null;
}

export interface ChatHealth {
  captureStatus: string;
  packetsSeen: number;
  packetsDropped: number;
  parseErrors: number;
  queueDepth: number | null;
  spoolBytes: number | null;
  recordedAt: string | null;
}

export interface ChatContext {
  /** Ventana agregada: últimas 24 h respecto de `now`. */
  period: { start: string; end: string };
  totals: {
    bytes: number;
    packets: number;
    windows: number;
    alerts: number;
  };
  topHosts: ChatTopHost[];
  topPorts: ChatTopPort[];
  topCountries: ChatTopCountry[];
  alerts: ChatAlert[];
  health: ChatHealth | null;
}

export interface ChatStoredMessage {
  id: string;
  role: ChatRole;
  content: string;
  tokensUsed: number;
  metadata: unknown;
  createdAt: string | null;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChatConversationSummary extends ChatConversation {
  messageCount: number;
}

export interface ChatStreamMeta {
  conversationId: string;
  model: string;
  provider: string;
  sources: string[];
  suggestions: string[];
  exportable: boolean;
  period: { start: string; end: string };
}

export interface ChatStreamDone {
  conversationId: string;
  model: string;
  provider: string;
  tokensUsed: number;
  executionTimeMs: number;
  warnings: string[];
  suggestions: string[];
  exportable: boolean;
}

export interface ChatLlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
