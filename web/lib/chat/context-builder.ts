// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Construcción del prompt del chatbot: contexto RAG + historial reciente.

import type { AiLanguage } from '@/lib/ai/openrouter';
import {
  CHAT_MAX_CONTEXT_MESSAGES,
  type ChatContext,
  type ChatLlmMessage,
  type ChatStoredMessage,
  type ChatTopHost,
} from './types';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function hostLabel(host: ChatTopHost): string {
  return host.ip ?? `host ${host.hostKey.slice(0, 8)}`;
}

const BASE_RULES = `Sos "SC Sentinel AI", el asistente de seguridad de red del producto SC Sentinel.
Tu trabajo es explicar el estado de la red del dispositivo autorizado usando SOLO el contexto RAG adjunto.

Reglas obligatorias:
- Respondé en español neutro, claro y profesional. No uses inglés salvo nombres propios o protocolos.
- El contexto corresponde a las últimas 24 horas de UN device autorizado. No consultes ni menciones otros devices.
- No inventes IPs, hosts, países, puertos, alertas, métricas ni nombres de dispositivos.
- Una IP solo puede mencionarse si aparece en el contexto (topHosts[].ip o alertas). Si no aparece, no la cites.
- Si el contexto no tiene ventanas o está vacío, decilo explícitamente y sugerí revisar la captura del agente.
- No reveles secretos, tokens, variables de entorno ni detalles internos de infraestructura.
- Sé breve: máximo ~250 palabras. Usá listas o markdown simple cuando ayude.
- Si el usuario pide un reporte o exportación, ofrecé un resumen estructurado; no inventes un archivo.`;

const ENGLISH_RULES = `You are "SC Sentinel AI", the network security assistant for SC Sentinel.
Explain the state of the authorized device using ONLY the attached RAG context.

Mandatory rules:
- Answer in neutral English.
- The context covers the last 24 hours of ONE authorized device. Never query or mention other devices.
- Do not invent IPs, hosts, countries, ports, alerts, metrics, or device names.
- Only mention an IP if it appears in the context (topHosts[].ip or alerts).
- If there are no windows or the context is empty, say so and suggest checking agent capture.
- Never reveal secrets, tokens, environment variables, or internal infrastructure details.
- Be concise: at most ~250 words. Use simple markdown when helpful.
- If the user asks for a report or export, offer a structured summary; do not invent a file.`;

export function buildChatSystemPrompt(language: AiLanguage = 'es'): string {
  return language === 'en' ? ENGLISH_RULES : BASE_RULES;
}

/** Contexto serializado que ve el modelo. No incluye paquetes crudos. */
export function formatContextForPrompt(context: ChatContext): string {
  return JSON.stringify(
    {
      period: context.period,
      totals: context.totals,
      top_hosts: context.topHosts,
      top_ports: context.topPorts,
      top_countries: context.topCountries,
      alerts: context.alerts,
      health: context.health,
    },
    null,
    2
  );
}

/**
 * System prompt + historial reciente + mensaje actual. El historial se acota a
 * `CHAT_MAX_CONTEXT_MESSAGES` y se evita duplicar el mensaje actual si ya está
 * persistido.
 */
export function buildLlmMessages(
  context: ChatContext,
  history: ChatStoredMessage[],
  userMessage: string,
  language: AiLanguage = 'es'
): ChatLlmMessage[] {
  const recent = history
    .slice(-CHAT_MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2000),
    }));

  const last = recent[recent.length - 1];
  if (last && last.role === 'user' && last.content.trim() === userMessage.trim()) {
    recent.pop();
  }

  return [
    {
      role: 'system',
      content: `${buildChatSystemPrompt(language)}

CONTEXTO RAG (últimas 24 h del device autorizado):
${formatContextForPrompt(context)}`,
    },
    ...recent,
    { role: 'user', content: userMessage },
  ];
}

/** Fuentes visibles en el evento `meta` del stream. */
export function summarizeSources(context: ChatContext): string[] {
  const sources: string[] = [];

  for (const host of context.topHosts.slice(0, 4)) {
    const country = host.country ? ` · ${host.country}` : '';
    sources.push(`${hostLabel(host)}${country} · ${formatBytes(host.bytes)}`);
  }

  for (const alert of context.alerts.slice(0, 3)) {
    sources.push(`Alerta ${alert.severity}: ${alert.title}`);
  }

  if (context.health) {
    sources.push(
      `Agente ${context.health.captureStatus}: ${context.health.packetsSeen.toLocaleString('es')} paquetes vistos`
    );
  }

  return sources.slice(0, 8);
}
