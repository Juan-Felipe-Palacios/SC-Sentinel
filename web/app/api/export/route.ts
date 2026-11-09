// web/app/api/export/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/export?metric=hosts|overview|alerts&range=1h&format=csv|xlsx
// CSV con ReadableStream (límite 10000), XLSX multi-sheet. Auth como /api/query.
import { NextRequest, NextResponse } from 'next/server';
import { ExportParamsSchema } from '@/lib/schemas/export';
import { authorize, clientIp } from '@/lib/auth/resolve';
import { checkGuestRequestLimit, guestRateLimitResponse } from '@/lib/rate-limit/guest';
import { resolveDeviceId } from '@/lib/query/device';
import { queryOverview } from '@/lib/query/overview';
import { queryAlertsExport, queryHostsExport, queryWindowsExport, ExportTooLargeError } from '@/lib/query/export';
import { escapeCsvCell, overviewToCsv } from '@/lib/export/csv';
import { csvStreamFromRows } from '@/lib/export/stream';
import { buildXlsxBufferMulti, rowsFromAlerts, rowsFromHosts, rowsFromOverview, rowsFromWindows } from '@/lib/export/xlsx';
import { logExport } from '@/lib/export/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: true });
  if (!check.ok) return check.response;
  const { auth } = check;

  const { searchParams } = new URL(request.url);
  const parsed = ExportParamsSchema.safeParse({
    metric: searchParams.get('metric') ?? undefined,
    range: searchParams.get('range') ?? undefined,
    format: searchParams.get('format') ?? undefined,
    device_id: searchParams.get('device_id') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid export params' },
      { status: 400, headers: noStoreHeaders }
    );
  }
  const { metric, range, format, device_id } = parsed.data;

  let guestDeviceId: string | null = null;
  if (auth.role === 'guest') {
    const limit = checkGuestRequestLimit(clientIp(request));
    if (!limit.allowed) return guestRateLimitResponse(limit.retryAfterSeconds);
    if (device_id && device_id !== auth.guest.deviceId) {
      return NextResponse.json(
        { error: 'forbidden', message: 'El visitante solo puede exportar su device de demostración.' },
        { status: 403, headers: noStoreHeaders }
      );
    }
    guestDeviceId = auth.guest.deviceId;
  }

  try {
    const deviceId = auth.role === 'guest' ? guestDeviceId : await resolveDeviceId(device_id);

    if (format === 'xlsx') {
      const windows = (await queryWindowsExport(range, deviceId)).windows;
      let buffer: Buffer;
      let rowCount = windows.length;
      if (metric === 'hosts') {
        const hosts = (await queryHostsExport(range, deviceId)).hosts;
        rowCount += hosts.length;
        buffer = buildXlsxBufferMulti({ Hosts: rowsFromHosts(hosts), Windows: rowsFromWindows(windows) });
      } else if (metric === 'alerts') {
        const alerts = (await queryAlertsExport(range, deviceId)).alerts;
        rowCount += alerts.length;
        buffer = buildXlsxBufferMulti({ Alerts: rowsFromAlerts(alerts), Windows: rowsFromWindows(windows) });
      } else {
        const overview = await queryOverview(range, deviceId);
        const hosts = (await queryHostsExport(range, deviceId)).hosts;
        rowCount += hosts.length;
        buffer = buildXlsxBufferMulti({
          Overview: rowsFromOverview(overview),
          Hosts: rowsFromHosts(hosts),
          Windows: rowsFromWindows(windows),
        });
      }
      const filename = `sc-sentinel-${metric}-${range}.xlsx`;
      void logExport({ role: auth.role, deviceId, metric, range, format, rowCount, bytes: 0 });
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          ...noStoreHeaders,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    if (metric === 'overview') {
      const csv = overviewToCsv(await queryOverview(range, deviceId));
      void logExport({ role: auth.role, deviceId, metric, range, format, rowCount: 0, bytes: 0 });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...noStoreHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sc-sentinel-overview-${range}.csv"`,
        },
      });
    }

    let header: string;
    let rows: string[];
    let rowCount = 0;
    if (metric === 'hosts') {
      const result = await queryHostsExport(range, deviceId);
      rowCount = result.rows;
      header = 'host_key,ip,country,bytes_in,bytes_out,packets,risk_score,first_seen,last_seen';
      rows = result.hosts.map((h) => [h.host_key, h.ip, h.country, h.bytes_in, h.bytes_out, h.packets, h.risk_score, h.first_seen, h.last_seen].map(escapeCsvCell).join(','));
    } else {
      const result = await queryAlertsExport(range, deviceId);
      rowCount = result.rows;
      header = 'id,window_id,rule_id,severity,title,created_at';
      rows = result.alerts.map((a) => [a.id, a.window_id, a.rule_id, a.severity, a.title, a.created_at].map(escapeCsvCell).join(','));
    }
    const stream = csvStreamFromRows(header, rows);
    void logExport({ role: auth.role, deviceId, metric, range, format, rowCount, bytes: 0 });
    return new NextResponse(stream, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sc-sentinel-${metric}-${range}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return NextResponse.json(
        { error: 'dataset_too_large', message: 'Dataset demasiado grande, filtra por fecha (limit 10000 filas).' },
        { status: 413, headers: noStoreHeaders }
      );
    }
    console.error('Error in /api/export:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
