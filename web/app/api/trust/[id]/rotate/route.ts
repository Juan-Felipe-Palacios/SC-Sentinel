// web/app/api/trust/[id]/rotate/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { rotateTrustPage } from '@/lib/trust/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;
  const { id } = await context.params;
  const rotated = await rotateTrustPage(id);
  if (!rotated) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
  return NextResponse.json({ id, token: rotated.token, url: `/p/${rotated.token}` }, { headers: noStoreHeaders });
}
