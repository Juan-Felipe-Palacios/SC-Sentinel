// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Cliente SSE del chatbot: fetch + ReadableStream (cookies de sesión incluidas).

import type { ChatStreamDone, ChatStreamMeta } from './types';

export interface ChatSseHandlers {
  onMeta?: (meta: ChatStreamMeta) => void;
  onToken?: (delta: string) => void;
  onDone?: (done: ChatStreamDone) => void;
  onError?: (error: { code: string; message: string }) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Parsea un bloque SSE (`event:` + una o más líneas `data:`). */
export function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n');
  if (!payload || payload === '[DONE]') return null;

  try {
    return { event, data: JSON.parse(payload) as unknown };
  } catch {
    return null;
  }
}

/**
 * Consume el stream del backend y despacha meta/token/done/error. El llamador
 * ya verificó `response.ok`; acá solo se procesan eventos.
 */
export async function consumeChatStream(
  response: Response,
  handlers: ChatSseHandlers
): Promise<void> {
  if (!response.body) {
    throw new Error('El servidor no devolvió un stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;

    if (parsed.event === 'meta' && isRecord(parsed.data)) {
      handlers.onMeta?.(parsed.data as unknown as ChatStreamMeta);
    } else if (parsed.event === 'token' && isRecord(parsed.data)) {
      const delta = parsed.data.delta;
      if (typeof delta === 'string') handlers.onToken?.(delta);
    } else if (parsed.event === 'done' && isRecord(parsed.data)) {
      handlers.onDone?.(parsed.data as unknown as ChatStreamDone);
    } else if (parsed.event === 'error' && isRecord(parsed.data)) {
      const code = typeof parsed.data.code === 'string' ? parsed.data.code : 'chat_error';
      const message =
        typeof parsed.data.message === 'string'
          ? parsed.data.message
          : 'No se pudo generar la respuesta.';
      handlers.onError?.({ code, message });
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let separator = buffer.indexOf('\n\n');
      while (separator >= 0) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        dispatch(block);
        separator = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) dispatch(buffer);
  } finally {
    reader.releaseLock();
  }
}
