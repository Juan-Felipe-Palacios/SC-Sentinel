// web/lib/trust/queries.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, trustPages } from '@/lib/db';
import { generateTrustToken, hashTrustToken } from './token';

export interface TrustPageListItem {
  id: string; device_id: string; label: string | null;
  created_at: string | null; revoked_at: string | null;
  expires_at: string | null; last_rotated_at: string | null;
}

export async function createTrustPage(deviceId: string, label?: string, expiresAt?: Date): Promise<{ id: string; token: string }> {
  const token = generateTrustToken();
  const id = `tr_${randomUUID()}`;
  await db.insert(trustPages).values({
    id, deviceId, tokenHash: hashTrustToken(token),
    label: label?.trim() || null,
    expiresAt: expiresAt ?? null,
  });
  return { id, token };
}

export async function listTrustPages(): Promise<TrustPageListItem[]> {
  const rows = await db.select().from(trustPages).orderBy(desc(trustPages.createdAt));
  return rows.map((r) => ({
    id: r.id, device_id: r.deviceId, label: r.label,
    created_at: r.createdAt?.toISOString() ?? null,
    revoked_at: r.revokedAt?.toISOString() ?? null,
    expires_at: r.expiresAt?.toISOString() ?? null,
    last_rotated_at: r.lastRotatedAt?.toISOString() ?? null,
  }));
}

export async function revokeTrustPage(id: string): Promise<boolean> {
  const updated = await db.update(trustPages).set({ revokedAt: new Date() })
    .where(and(eq(trustPages.id, id), isNull(trustPages.revokedAt)))
    .returning({ id: trustPages.id });
  return updated.length > 0;
}

/** Rota: nuevo hash + last_rotated_at; el token anterior deja de resolver. */
export async function rotateTrustPage(id: string): Promise<{ token: string } | null> {
  const current = await db.select({ tokenHash: trustPages.tokenHash, revokedAt: trustPages.revokedAt })
    .from(trustPages).where(eq(trustPages.id, id)).limit(1);
  if (!current[0] || current[0].revokedAt) return null;
  const token = generateTrustToken();
  await db.update(trustPages).set({ tokenHash: hashTrustToken(token), lastRotatedAt: new Date() })
    .where(eq(trustPages.id, id));
  return { token };
}

export async function resolveTrustPage(token: string): Promise<{ device_id: string; label: string | null } | null> {
  const hash = hashTrustToken(token);
  const rows = await db.select({ device_id: trustPages.deviceId, label: trustPages.label, revoked_at: trustPages.revokedAt, expires_at: trustPages.expiresAt })
    .from(trustPages).where(eq(trustPages.tokenHash, hash)).limit(1);
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return null;
  return { device_id: row.device_id, label: row.label };
}
