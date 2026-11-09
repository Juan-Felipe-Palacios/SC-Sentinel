// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// DELETE /api/devices/[id] — elimina el device y todos sus datos asociados.

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { deleteDevice } from '@/lib/query/devices';
import { logServerError } from '@/lib/logging/error';

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
    const deleted = await deleteDevice(id);
    if (!deleted) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
    }

    return NextResponse.json(
      { deleted: true, device_id: id },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    logServerError('device_delete_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
