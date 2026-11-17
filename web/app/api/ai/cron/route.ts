// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/ai/cron — análisis por lotes externo (§5.4): x-cron-secret (Plan B) o Bearer.
// GET devuelve 404 (Vercel Cron no debe golpear esta ruta).
// NO agregar a vercel.json (D1): corre vía cron externo (cron-job.org) cada ~5 min.

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/auth/secrets';
import { resolveDeviceId } from '@/lib/query/device';
import { AI_CRON_MIN_INTERVAL_MS, checkDailyBudget, runAiPipeline } from '@/lib/ai';
import { logServerError } from '@/lib/logging/error';
import { classifyOperationalError, isUnavailableCode } from '@/lib/errors/classify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

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
  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
}

export async function GET(): Promise<NextResponse> {
  return notFound();
}

export async function POST(request: NextRequest) {
  if (!checkSecret(request)) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: noStoreHeaders }
    );
  }

  try {
    // 1) Presupuesto antes de tocar device/ventanas: si no queda cuota, no se
    // despierta la base con consultas de datos. Con presupuesto 0 no consulta.
    const budget = await checkDailyBudget();
    if (budget.exhausted) {
      console.warn(
        JSON.stringify({ event: 'ai_budget_exhausted', used: budget.used, budget: budget.budget })
      );
      return NextResponse.json(
        { ok: true, status: 'budget_exhausted' },
        { status: 200, headers: noStoreHeaders }
      );
    }

    // 2) Device y análisis por lotes.
    const deviceId = await resolveDeviceId(undefined);
    if (!deviceId) {
      console.log(JSON.stringify({ event: 'ai_cron', status: 'no_data' }));
      return NextResponse.json(
        { ok: true, status: 'no_data' },
        { status: 200, headers: noStoreHeaders }
      );
    }

    const started = Date.now();
    // Modo cron: dedup por intervalo (15 min) + salida temprana si no hay
    // datos nuevos desde el último insight (Estrategias A y B).
    const result = await runAiPipeline(deviceId, undefined, 'es', {
      minIntervalMs: AI_CRON_MIN_INTERVAL_MS,
      skipBudgetCheck: true,
    });

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

    return NextResponse.json(
      { ok: true, status: result.status, insight: result.insight },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    // Solo el código operativo: nada de SQL, parámetros, URLs ni payloads.
    const code = classifyOperationalError(error);
    logServerError('ai_cron_failed', error, { code });
    return NextResponse.json(
      { error: 'internal_error' },
      { status: isUnavailableCode(code) ? 503 : 500, headers: noStoreHeaders }
    );
  }
}
