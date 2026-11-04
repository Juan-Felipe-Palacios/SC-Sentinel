// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/ai/cron — análisis por lotes externo (§5.4): x-cron-secret (Plan B) o Bearer.
// GET devuelve 404 (Vercel Cron no debe golpear esta ruta).
// NO agregar a vercel.json (D1): corre vía cron externo (cron-job.org) cada ~5 min.

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/auth/secrets';
import { resolveDeviceId } from '@/lib/query/device';
import { runAiPipeline } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkSecret(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('x-cron-secret');
  if (header && safeEqual(header, expected)) return true;

  const auth = request.headers.get('authorization')?.trim();
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token && safeEqual(token, expected)) return true;
  }
  return false;
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function GET(): Promise<NextResponse> {
  return notFound();
}

export async function POST(request: NextRequest) {
  if (!checkSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const deviceId = await resolveDeviceId(undefined);
    if (!deviceId) {
      console.log(JSON.stringify({ event: 'ai_cron', status: 'no_data' }));
      return NextResponse.json({ ok: true, status: 'no_data' });
    }

    const started = Date.now();
    const result = await runAiPipeline(deviceId);

    console.log(
      JSON.stringify({
        event: 'ai_cron',
        status: result.status,
        device_id: deviceId,
        facts_hash: result.insight?.facts_hash,
        ai_insights_id: result.insight?.id,
        duration_ms: Date.now() - started,
      })
    );

    return NextResponse.json({ ok: true, status: result.status, insight: result.insight });
  } catch (error) {
    console.error(JSON.stringify({ event: 'ai_cron_failed', error: String(error) }));
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
