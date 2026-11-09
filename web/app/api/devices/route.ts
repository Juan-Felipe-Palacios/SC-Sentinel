// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/devices — lista de devices enrolados (ADR-0010). Solo admin.

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { listDevices } from '@/lib/query/devices';
import { logServerError } from '@/lib/logging/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request);
  if (!check.ok) return check.response;

  try {
    const devices = await listDevices();
    return NextResponse.json({ devices }, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    logServerError('devices_list_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
