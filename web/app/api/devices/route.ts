// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/devices — lista de devices enrolados (ADR-0010). Solo admin.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { listDevices } from '@/lib/query/devices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStoreHeaders });
  }

  try {
    const devices = await listDevices();
    return NextResponse.json({ devices }, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    console.error('GET /api/devices:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
