// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { sql } from 'drizzle-orm';
import { defaultQueryDb, queryRows, type QueryDb } from './db-rows';

export const OPERATORS_LIMIT = 200;

export interface OperatorSummary {
  id: string;
  email: string;
  name: string;
}

export interface OperatorAuthRecord extends OperatorSummary {
  passwordHash: string;
  status: string;
}

export async function findActiveOperatorByEmail(
  email: string,
  database: QueryDb = defaultQueryDb
): Promise<OperatorAuthRecord | null> {
  const rows = await queryRows<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
    status: string;
  }>(
    database,
    sql`SELECT id, email, name, password_hash, status
        FROM operators
        WHERE email = ${email} AND status = 'active'
        LIMIT 1`
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    status: row.status,
  };
}

export async function findActiveOperatorById(
  operatorId: string,
  database: QueryDb = defaultQueryDb
): Promise<OperatorSummary | null> {
  const rows = await queryRows<OperatorSummary>(
    database,
    sql`SELECT id, email, name
        FROM operators
        WHERE id = ${operatorId} AND status = 'active'
        LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function listActiveOperators(
  database: QueryDb = defaultQueryDb
): Promise<OperatorSummary[]> {
  return queryRows<OperatorSummary>(
    database,
    sql`SELECT id, email, name
        FROM operators
        WHERE status = 'active'
        ORDER BY name ASC, email ASC
        LIMIT ${OPERATORS_LIMIT}`
  );
}

export async function markOperatorLogin(
  operatorId: string,
  database: QueryDb = defaultQueryDb
): Promise<void> {
  await queryRows(
    database,
    sql`UPDATE operators SET last_login_at = now(), updated_at = now() WHERE id = ${operatorId}`
  );
}
