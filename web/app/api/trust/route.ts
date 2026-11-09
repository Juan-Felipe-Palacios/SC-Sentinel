// web/app/api/trust/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Solo admin (guest 403). GET lista, POST crea, DELETE revoca.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth/resolve';
import { createTrustPage, listTrustPages, revokeTrustPage } from '@/lib/trust/queries';
import { logServerError } from '@/lib/logging/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

const CreateTrustSchema = z.object({
  device_id: z.string().trim().min(1).max(120),
  label: z.string().trim().max(120).optional(),
  expires_at: z.string().datetime().optional(),
}).strict();

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const check = await authorize(request, { allowGuest: false });
  return check.ok ? null : check.response;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ pages: await listTrustPages() }, { headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'El cuerpo debe ser JSON válido.' }, { status: 400, headers: noStoreHeaders });
  }
  const parsed = CreateTrustSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', message: 'device_id inválido.' }, { status: 400, headers: noStoreHeaders });
  }
  try {
    const expiresAt = parsed.data.expires_at ? new Date(parsed.data.expires_at) : undefined;
    const created = await createTrustPage(parsed.data.device_id, parsed.data.label, expiresAt);
    return NextResponse.json({ id: created.id, token: created.token, url: `/p/${created.token}` }, { headers: noStoreHeaders });
  } catch (error) {
    logServerError('trust_page_create_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'bad_request', message: 'Falta el parámetro id.' }, { status: 400, headers: noStoreHeaders });
  const revoked = await revokeTrustPage(id);
  if (!revoked) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
