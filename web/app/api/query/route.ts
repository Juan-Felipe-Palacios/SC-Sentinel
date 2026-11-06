// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Normative query endpoint for dashboard: docs/contracts/ & spec §5.2

import { NextRequest, NextResponse } from 'next/server';
import { QueryParamsSchema } from '@/lib/schemas/query';
import { verifyAdminAuth } from '@/lib/auth/admin';
import { resolveDeviceId } from '@/lib/query/device';
import { queryOverview } from '@/lib/query/overview';
import { queryHosts } from '@/lib/query/hosts';
import { queryAlerts } from '@/lib/query/alerts';
import { queryHealth } from '@/lib/query/health';
import { fetchLatestInsight } from '@/lib/ai/analyze';
import { attachHostnames } from '@/lib/dns/reverse';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  // 1. Admin auth: JWT de sesión firmada (o x-sc-admin-secret / Bearer para tooling)
  const auth = await verifyAdminAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStoreHeaders });
  }

  // 2. Validate params
  const { searchParams } = new URL(request.url);
  const parsed = QueryParamsSchema.safeParse({
    metric: searchParams.get('metric') ?? undefined,
    range: searchParams.get('range') ?? undefined,
    device_id: searchParams.get('device_id') ?? undefined,
    lang: searchParams.get('lang') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid query params' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const { metric, range, device_id, lang } = parsed.data;

  // 3. Resolve single-device v1: explicit device_id > DEFAULT_DEVICE_ID > first device
  try {
    const deviceId = await resolveDeviceId(device_id);

    switch (metric) {
      case 'overview':
        // Los hosts muestran nombre (DNS inverso) + IP; si la resolución falla queda la IP.
        {
          const overview = await queryOverview(range, deviceId);
          return NextResponse.json(
            { ...overview, top_hosts: await attachHostnames(overview.top_hosts) },
            { status: 200, headers: noStoreHeaders }
          );
        }
      case 'hosts':
        return NextResponse.json(await queryHosts(range, deviceId), {
          status: 200,
          headers: noStoreHeaders,
        });
      case 'alerts':
        return NextResponse.json(await queryAlerts(range, deviceId), {
          status: 200,
          headers: noStoreHeaders,
        });
      case 'health':
        return NextResponse.json(await queryHealth(deviceId), {
          status: 200,
          headers: noStoreHeaders,
        });
      case 'ai': {
        // AI insights (§5.2, D10): último insight del device en el idioma pedido;
        // {} cuando todavía no hay análisis en ese idioma.
        const insight = deviceId ? await fetchLatestInsight(deviceId, lang) : null;
        return NextResponse.json(insight ?? {}, { status: 200, headers: noStoreHeaders });
      }
    }
  } catch (error) {
    console.error('Error in /api/query:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
