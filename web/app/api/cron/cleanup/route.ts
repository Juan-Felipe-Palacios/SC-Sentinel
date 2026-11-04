// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextRequest, NextResponse } from 'next/server';
import { runRetentionCleanup } from '@/lib/cleanup/retention';
import { safeEqual } from '@/lib/auth/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

/**
 * Autenticación del cron diario (spec §12.4 / §5.4 / runbook docs/runbooks/database-cleanup.md).
 * Acepta `Authorization: Bearer $CRON_SECRET` (Vercel Cron) o `x-cron-secret: $CRON_SECRET` (Plan B externo).
 */
function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (bearer && safeEqual(bearer, secret)) return true;

  const header = request.headers.get('x-cron-secret')?.trim();
  return Boolean(header && safeEqual(header, secret));
}

async function handleCron(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStoreHeaders });
  }

  try {
    const report = await runRetentionCleanup();
    console.log(
      JSON.stringify({ event: 'cron_cleanup', ...report })
    );
    return NextResponse.json(report, { headers: noStoreHeaders });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'cron_cleanup_failed',
        message: error instanceof Error ? error.message : 'unknown_error',
      })
    );
    return NextResponse.json({ error: 'cleanup_failed' }, { status: 500, headers: noStoreHeaders });
  }
}

// Vercel Cron usa GET; el runbook (Plan B) invoca POST. Se soportan ambos.
export const POST = handleCron;
export const GET = handleCron;
