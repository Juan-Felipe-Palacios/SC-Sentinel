// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/chat/history - conversaciones o mensajes de UN device autorizado.

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { resolveChatDeviceId } from '@/lib/chat/device';
import {
  getConversation,
  getConversationMessages,
  listConversations,
} from '@/lib/chat/history';
import { ChatHistoryQuerySchema } from '@/lib/chat/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  // El historial persistente es exclusivo de administración.
  const check = await authorize(request);
  if (!check.ok) return check.response;

  const { searchParams } = new URL(request.url);
  const parsed = ChatHistoryQuerySchema.safeParse({
    device_id: searchParams.get('device_id') ?? undefined,
    conversation_id: searchParams.get('conversation_id') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Parámetros inválidos.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const deviceId = await resolveChatDeviceId(parsed.data.device_id);
    if (!deviceId) {
      return NextResponse.json(
        { error: 'no_device', message: 'No hay un device enrolado para consultar.' },
        { status: 404, headers: noStoreHeaders }
      );
    }

    if (parsed.data.conversation_id) {
      const conversation = await getConversation(parsed.data.conversation_id, deviceId);
      if (!conversation) {
        return NextResponse.json(
          { error: 'not_found', message: 'La conversación no existe para este device.' },
          { status: 404, headers: noStoreHeaders }
        );
      }

      const messages = await getConversationMessages(
        conversation.id,
        deviceId,
        undefined,
        50
      );
      return NextResponse.json(
        { conversation, messages },
        { status: 200, headers: noStoreHeaders }
      );
    }

    const conversations = await listConversations(
      deviceId,
      undefined,
      parsed.data.limit
    );
    return NextResponse.json(
      { conversations },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'chat_history_failed',
        error: error instanceof Error ? error.name : 'unknown',
      })
    );
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
