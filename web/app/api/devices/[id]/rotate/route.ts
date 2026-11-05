// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/devices/[id]/rotate — revoca el token anterior y emite uno nuevo.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { rotateDeviceToken } from '@/lib/query/devices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStoreHeaders });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const enrollment = await rotateDeviceToken(id);
    if (!enrollment) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
    }

    return NextResponse.json(
      {
        device_id: enrollment.device.id,
        token: enrollment.token,
        expires_at: enrollment.expires_at,
        device: enrollment.device,
      },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    console.error('POST /api/devices/[id]/rotate:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
