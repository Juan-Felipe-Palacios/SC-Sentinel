// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Normative query endpoint for dashboard: docs/contracts/ & spec §5.2

import { NextRequest, NextResponse } from 'next/server';
import { QueryParamsSchema } from '@/lib/schemas/query';
import { authorize, clientIp } from '@/lib/auth/resolve';
import { checkGuestRequestLimit, guestRateLimitResponse } from '@/lib/rate-limit/guest';
import { resolveDeviceId } from '@/lib/query/device';
import { queryOverview } from '@/lib/query/overview';
import { queryHosts } from '@/lib/query/hosts';
import { queryAlerts } from '@/lib/query/alerts';
import { queryHealth } from '@/lib/query/health';
import { fetchLatestInsight } from '@/lib/ai/analyze';
import { attachHostnames } from '@/lib/dns/reverse';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  // 1. Admin o visitante (solo lectura). El visitante queda acotado a su device.
  const check = await authorize(request, { allowGuest: true });
  if (!check.ok) return check.response;
  const { auth } = check;

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

  // 3. Guest: device fijo del token; nunca el query param. Admin: single-device v1.
  let guestDeviceId: string | null = null;
  if (auth.role === 'guest') {
    // La demo es pública: el límite se ata a la IP, no a un token renovable.
    const limit = checkGuestRequestLimit(clientIp(request));
    if (!limit.allowed) {
      return guestRateLimitResponse(limit.retryAfterSeconds);
    }
    if (device_id && device_id !== auth.guest.deviceId) {
      return NextResponse.json(
        { error: 'forbidden', message: 'El visitante solo puede consultar su device de demostración.' },
        { status: 403, headers: noStoreHeaders }
      );
    }
    guestDeviceId = auth.guest.deviceId;
  }

  try {
    const deviceId =
      auth.role === 'guest' ? guestDeviceId : await resolveDeviceId(device_id);

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
