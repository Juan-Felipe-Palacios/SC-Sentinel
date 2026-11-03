// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import type { SQL } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface QueryDb {
  execute(query: SQL): Promise<unknown>;
}

export const defaultQueryDb = db as unknown as QueryDb;

export async function queryRows<T>(database: QueryDb, query: SQL): Promise<T[]> {
  const result = await database.execute(query);

  if (Array.isArray(result)) {
    return result as T[];
  }

  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function bigintToNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
