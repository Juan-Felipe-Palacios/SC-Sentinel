// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/ai/analyze — desencadena procesamiento bajo Admin (§5.3):
// <5 min sin facts nuevos ⇒ 200 {cached:true}; cadena agotada ⇒ 200 {status:"degraded"}.

import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { resolveDeviceId } from '@/lib/query/device';
import { parseAiLanguage, runAiPipeline } from '@/lib/ai';
import { logServerError } from '@/lib/logging/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const check = await authorize(request);
  if (!check.ok) return check.response;

  try {
    const deviceId = await resolveDeviceId(undefined);
    if (!deviceId) {
      return NextResponse.json({ status: 'no_data', insight: null }, { status: 200 });
    }

    // El panel IA permite pedir el análisis en español (por defecto) o en inglés.
    const language = parseAiLanguage(new URL(request.url).searchParams.get('lang'));
    const result = await runAiPipeline(deviceId, undefined, language);

    if (result.status === 'cached') {
      return NextResponse.json({ cached: true, insight: result.insight }, { status: 200 });
    }

    return NextResponse.json(
      { status: result.status, insight: result.insight },
      { status: 200 }
    );
  } catch (error) {
    logServerError('ai_analyze_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
