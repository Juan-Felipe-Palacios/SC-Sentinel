// web/app/api/export/stats/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Agregados de export_logs para el dashboard admin. Solo admin.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { authorize } from '@/lib/auth/resolve';
import { db, exportLogs } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const totals = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`);
  const byRole = await db
    .select({ role: exportLogs.role, total: sql<number>`COUNT(*)::int` })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .groupBy(exportLogs.role);
  const byMetric = await db
    .select({ metric: exportLogs.metric, total: sql<number>`COUNT(*)::int`, rows: sql<number>`COALESCE(SUM(row_count),0)::bigint` })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .groupBy(exportLogs.metric);
  const recent = await db
    .select({ role: exportLogs.role, device_id: exportLogs.deviceId, metric: exportLogs.metric, range: exportLogs.range, format: exportLogs.format, row_count: exportLogs.rowCount, created_at: exportLogs.createdAt })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .orderBy(sql`created_at DESC`)
    .limit(50);

  return NextResponse.json(
    {
      total: Number(totals[0]?.total ?? 0),
      by_role: byRole.map((r) => ({ role: r.role, total: Number(r.total) })),
      by_metric: byMetric.map((m) => ({ metric: m.metric, total: Number(m.total), rows: Number(m.rows) })),
      recent: recent.map((r) => ({
        role: r.role, device_id: r.device_id, metric: r.metric, range: r.range, format: r.format,
        row_count: Number(r.row_count), created_at: r.created_at ? r.created_at.toISOString() : null,
      })),
    },
    { headers: noStoreHeaders }
  );
}
