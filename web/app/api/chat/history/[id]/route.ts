// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// DELETE /api/chat/history/[id] - borra la conversación y sus mensajes,
// únicamente si pertenece al device autorizado.

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { resolveChatDeviceId } from '@/lib/chat/device';
import { deleteConversation } from '@/lib/chat/history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await authorize(request);
  if (!check.ok) return check.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const { searchParams } = new URL(request.url);
    const deviceId = await resolveChatDeviceId(searchParams.get('device_id'));
    if (!deviceId) {
      return NextResponse.json(
        { error: 'no_device', message: 'No hay un device enrolado para consultar.' },
        { status: 404, headers: noStoreHeaders }
      );
    }

    const deleted = await deleteConversation(id, deviceId);
    if (!deleted) {
      return NextResponse.json(
        { error: 'not_found', message: 'La conversación no existe para este device.' },
        { status: 404, headers: noStoreHeaders }
      );
    }

    return NextResponse.json(
      { deleted: true, conversation_id: id },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'chat_history_delete_failed',
        error: error instanceof Error ? error.name : 'unknown',
      })
    );
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
