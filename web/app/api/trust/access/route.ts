// web/app/api/trust/access/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Lista de accesos a Trust Pages (30 días, 500 filas). Solo admin.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { authorize } from '@/lib/auth/resolve';
import { db, trustPageAccessLogs } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({
      id: trustPageAccessLogs.id,
      token_hash: trustPageAccessLogs.tokenHash,
      ip_anon: trustPageAccessLogs.ipAnon,
      user_agent_hash: trustPageAccessLogs.userAgentHash,
      created_at: trustPageAccessLogs.createdAt,
    })
    .from(trustPageAccessLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .orderBy(sql`created_at DESC`)
    .limit(500);

  return NextResponse.json(
    {
      accesses: rows.map((r) => ({
        id: r.id,
        token_hash_prefix: r.token_hash.slice(0, 12),
        ip_anon: r.ip_anon,
        user_agent_hash: r.user_agent_hash,
        created_at: r.created_at ? r.created_at.toISOString() : null,
      })),
    },
    { headers: noStoreHeaders },
  );
}
