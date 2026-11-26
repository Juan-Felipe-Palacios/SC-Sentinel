// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/devices/[id]/ot-assets — inventario de activos OT observados por el
// dispositivo. Sólo admin: `host_key` es el HMAC del nodo y el modo visitante no
// expone datos OT (clase B).

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { getDeviceById } from '@/lib/query/devices';
import {
  listOtAssets,
  OT_ASSETS_DEFAULT_LIMIT,
  OT_ASSETS_MAX_LIMIT,
} from '@/lib/query/ot-assets';
import { logServerError } from '@/lib/logging/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

/** `limit` opcional: entero positivo; ausente = 100; se acota a 200. */
function parseLimit(raw: string | null): number | null {
  if (raw === null) return OT_ASSETS_DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, OT_ASSETS_MAX_LIMIT);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  const { id } = await params;
  if (!id || id.length > 128) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStoreHeaders });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  if (limit === null) {
    return NextResponse.json(
      { error: 'bad_request', message: 'limit debe ser un entero entre 1 y 200.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const device = await getDeviceById(id);
    if (!device) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
    }

    const assets = await listOtAssets(id, { limit });
    return NextResponse.json(
      { device_id: id, count: assets.length, assets },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    logServerError('ot_assets_list_failed', error);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
