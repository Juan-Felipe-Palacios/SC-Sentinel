// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/devices/[id]/rotate — rota el token del device (solo admin).
// El token anterior deja de autenticar de inmediato; el nuevo se muestra una vez.

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { rotateDeviceToken } from '@/lib/query/devices';
import { logServerError } from '@/lib/logging/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const rotated = await rotateDeviceToken(id);
    if (!rotated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
    }

    return NextResponse.json(
      { device_id: id, token: rotated.token },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    logServerError('device_rotate_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
