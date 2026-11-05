// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/devices/enroll — alta manual de device (ADR-0010, M3.1).
// El token en claro se devuelve una única vez; en la base solo queda su SHA-256.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { enrollDevice } from '@/lib/query/devices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

const EnrollSchema = z.object({
  name: z.string().trim().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStoreHeaders });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStoreHeaders });
  }

  const parsed = EnrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'name inválido' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const enrollment = await enrollDevice({ name: parsed.data.name ?? null });
    return NextResponse.json(
      {
        device_id: enrollment.device.id,
        token: enrollment.token,
        expires_at: enrollment.expires_at,
        device: enrollment.device,
      },
      { status: 201, headers: noStoreHeaders }
    );
  } catch (error) {
    console.error('POST /api/devices/enroll:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
