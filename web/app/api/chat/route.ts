// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/chat - Security Chatbot (M3.5, backend MVP).
//
// Seguridad: solo admin autenticado (cookie de sesión, x-sc-admin-secret o
// Bearer admin). El device_id se resuelve del query param/DEFAULT_DEVICE_ID y
// NUNCA de `body.context`; todo el RAG y el historial se filtran por ese device.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { resolveChatDeviceId } from '@/lib/chat/device';
import {
  appendMessage,
  createConversation,
  getConversation,
  getRecentMessages,
  titleFromMessage,
} from '@/lib/chat/history';
import { fetchChatContext } from '@/lib/chat/rag';
import { buildLlmMessages, summarizeSources } from '@/lib/chat/context-builder';
import {
  buildSuggestions,
  detectQueryType,
  isExportableQuery,
} from '@/lib/chat/suggestions';
import {
  ChatLlmError,
  estimateTokens,
  resolveChatModelPlan,
  streamChatCompletion,
} from '@/lib/chat/llm';
import { ChatRequestSchema } from '@/lib/chat/schemas';
import { validateChatAnswer } from '@/lib/chat/validator';
import {
  CHAT_TOKEN_BUDGET,
  type ChatStreamDone,
  type ChatStreamMeta,
} from '@/lib/chat/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };
const streamHeaders = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

const encoder = new TextEncoder();

function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json(
    { error, ...(message ? { message } : {}) },
    { status, headers: noStoreHeaders }
  );
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authenticated) {
    return jsonError('unauthorized', 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 400, 'El cuerpo debe ser JSON válido.');
  }

  // `.strict()` rechaza `context.deviceId` y cualquier campo no previsto.
  const parsed = ChatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(
      'bad_request',
      400,
      parsed.error.issues[0]?.message ?? 'Cuerpo de la consulta inválido.'
    );
  }

  const { message } = parsed.data;

  try {
    const { searchParams } = new URL(request.url);
    const deviceId = await resolveChatDeviceId(searchParams.get('device_id'));
    if (!deviceId) {
      return jsonError('no_device', 404, 'No hay un device enrolado para consultar.');
    }

    let conversationId = parsed.data.conversationId;
    if (conversationId) {
      const existing = await getConversation(conversationId, deviceId);
      if (!existing) {
        return jsonError('not_found', 404, 'La conversación no existe para este device.');
      }
    } else {
      const created = await createConversation(deviceId, titleFromMessage(message));
      conversationId = created.id;
    }

    const activeConversationId = conversationId;
    const [context, history] = await Promise.all([
      fetchChatContext(deviceId),
      getRecentMessages(activeConversationId, deviceId),
    ]);

    const suggestions = buildSuggestions(detectQueryType(message), context);
    const exportable = isExportableQuery(message);
    const sources = summarizeSources(context);
    const llmMessages = buildLlmMessages(context, history, message);
    const plan = resolveChatModelPlan();

    // El mensaje del usuario se persiste antes de abrir el stream: si el LLM
    // falla, la conversación conserva la pregunta y el error queda en metadata.
    await appendMessage({
      conversationId: activeConversationId,
      deviceId,
      role: 'user',
      content: message,
      tokensUsed: 0,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            closed = true;
          }
        };

        const startedAt = Date.now();
        let fullText = '';
        let tokensUsed = 0;
        let model = plan.models[0] ?? 'unknown';
        let provider: string = plan.provider;

        try {
          const meta: ChatStreamMeta = {
            conversationId: activeConversationId,
            model,
            provider,
            sources,
            suggestions,
            exportable,
            period: context.period,
          };
          send('meta', meta);

          for await (const chunk of streamChatCompletion(llmMessages, {
            signal: request.signal,
          })) {
            if (chunk.type === 'delta') {
              fullText += chunk.text;
              send('token', { delta: chunk.text });
            } else {
              tokensUsed = chunk.tokensUsed;
              model = chunk.model;
              provider = chunk.provider;
            }
          }

          if (!fullText.trim()) {
            fullText =
              'No pude generar una respuesta con el contexto disponible. Probá reformular la consulta.';
            send('token', { delta: fullText });
          }

          const executionTimeMs = Date.now() - startedAt;
          const validation = validateChatAnswer(fullText, context);
          const done: ChatStreamDone = {
            conversationId: activeConversationId,
            model,
            provider,
            tokensUsed: Math.min(
              tokensUsed || estimateTokens(fullText),
              CHAT_TOKEN_BUDGET
            ),
            executionTimeMs,
            warnings: validation.warnings,
            suggestions,
            exportable,
          };

          try {
            await appendMessage({
              conversationId: activeConversationId,
              deviceId,
              role: 'assistant',
              content: fullText,
              tokensUsed: done.tokensUsed,
              metadata: {
                model,
                provider,
                warnings: validation.warnings,
                executionTimeMs,
                suggestions,
                exportable,
                sources,
              },
            });
          } catch (persistenceError) {
            console.error(
              JSON.stringify({
                event: 'chat_persist_failed',
                error: persistenceError instanceof Error ? persistenceError.name : 'unknown',
              })
            );
            done.warnings = [
              ...done.warnings,
              'La respuesta no se pudo guardar en el historial.',
            ];
          }

          send('done', done);
        } catch (error) {
          const code = error instanceof ChatLlmError ? error.code : 'chat_error';
          const failureMessage =
            error instanceof ChatLlmError
              ? error.message
              : 'No se pudo generar la respuesta. Intentá de nuevo.';

          // Solo el código: nunca el prompt ni la clave del proveedor.
          console.error(JSON.stringify({ event: 'chat_stream_failed', code }));

          if (fullText.trim()) {
            try {
              await appendMessage({
                conversationId: activeConversationId,
                deviceId,
                role: 'assistant',
                content: fullText,
                tokensUsed: Math.min(estimateTokens(fullText), CHAT_TOKEN_BUDGET),
                metadata: {
                  model,
                  provider,
                  aborted: true,
                  warnings: [failureMessage],
                },
              });
            } catch (persistenceError) {
              console.error(
                JSON.stringify({
                  event: 'chat_persist_partial_failed',
                  error:
                    persistenceError instanceof Error ? persistenceError.name : 'unknown',
                })
              );
            }
          }

          send('error', { code, message: failureMessage });
        } finally {
          try {
            controller.close();
          } catch {
            // El cliente ya cerró el stream.
          }
        }
      },
    });

    return new Response(stream, { status: 200, headers: streamHeaders });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'chat_request_failed',
        error: error instanceof Error ? error.name : 'unknown',
      })
    );
    return jsonError('internal_error', 500);
  }
}
