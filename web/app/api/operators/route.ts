// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/operators — operadores activos para asignar alertas (solo admin).

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { listActiveOperators } from '@/lib/query/operators';
import { logServerError } from '@/lib/logging/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  try {
    const operators = await listActiveOperators();
    return NextResponse.json({ operators }, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    logServerError('operators_list_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}