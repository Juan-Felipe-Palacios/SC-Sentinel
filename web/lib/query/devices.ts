// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Enrolamiento manual de devices (ADR-0010, M3.1): listar, crear y rotar tokens.
// El token en claro solo existe en la respuesta de creación/rotación: en la base
// se guarda únicamente su SHA-256 (lib/auth/token.ts).

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { hashToken } from '@/lib/auth/token';
import { defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';

/** Validez del token emitido al enrolar o rotar (ADR-0010). */
export const DEVICE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Estado inicial: pasa a `active` con el primer ingest exitoso. */
export const DEVICE_STATUS_ENROLLED_PENDING = 'enrolled_pending';

export interface DeviceRecord {
  id: string;
  name: string | null;
  status: string;
  enrolled_at: string;
  last_seen_at: string | null;
  token_expires_at: string | null;
}

export interface Enrollment {
  device: DeviceRecord;
  /** Token en claro: se muestra una sola vez y no se puede recuperar después. */
  token: string;
  expires_at: string;
}

interface DeviceRow {
  id: string;
  name: string | null;
  status: string;
  enrolled_at: Date | string;
  last_seen_at: Date | string | null;
  token_expires_at: Date | string | null;
}

function mapDeviceRow(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name ?? null,
    status: row.status,
    enrolled_at: isoOrNull(row.enrolled_at) ?? String(row.enrolled_at),
    last_seen_at: isoOrNull(row.last_seen_at),
    token_expires_at: isoOrNull(row.token_expires_at),
  };
}

function newToken(): string {
  return `sc_dev_${randomUUID()}`;
}

function tokenExpiry(now: Date): Date {
  return new Date(now.getTime() + DEVICE_TOKEN_TTL_MS);
}

/** Devices enrolados, del más antiguo al más reciente (v1 single-device). */
export async function listDevices(database: QueryDb = defaultQueryDb): Promise<DeviceRecord[]> {
  const rows = await queryRows<DeviceRow>(
    database,
    sql`SELECT id, name, status, enrolled_at, last_seen_at, token_expires_at
        FROM devices
        ORDER BY enrolled_at ASC`
  );
  return rows.map(mapDeviceRow);
}

/**
 * Crea un device en estado `enrolled_pending` con un token de 24 h.
 * El token devuelto no se persiste: solo su hash.
 */
export async function enrollDevice(
  input: { name?: string | null } = {},
  database: QueryDb = defaultQueryDb,
  now: Date = new Date()
): Promise<Enrollment> {
  const deviceId = `dev_${randomUUID()}`;
  const token = newToken();
  const expiresAt = tokenExpiry(now);
  const trimmedName = input.name?.trim();
  const name = trimmedName ? trimmedName.slice(0, 120) : null;

  const rows = await queryRows<DeviceRow>(
    database,
    sql`INSERT INTO devices (id, token_hash, name, status, token_expires_at)
        VALUES (
          ${deviceId},
          ${hashToken(token)},
          ${name},
          ${DEVICE_STATUS_ENROLLED_PENDING},
          ${expiresAt.toISOString()}::timestamptz
        )
        RETURNING id, name, status, enrolled_at, last_seen_at, token_expires_at`
  );

  const device = rows[0]
    ? mapDeviceRow(rows[0])
    : {
        id: deviceId,
        name,
        status: DEVICE_STATUS_ENROLLED_PENDING,
        enrolled_at: now.toISOString(),
        last_seen_at: null,
        token_expires_at: expiresAt.toISOString(),
      };

  return { device, token, expires_at: expiresAt.toISOString() };
}

/**
 * Revoca el token anterior emitiendo uno nuevo (24 h). Devuelve null si el
 * device no existe. El agente con el token viejo recibe 401 hasta actualizar
 * su configuración (su spool se conserva).
 */
export async function rotateDeviceToken(
  deviceId: string,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date()
): Promise<Enrollment | null> {
  const token = newToken();
  const expiresAt = tokenExpiry(now);

  const rows = await queryRows<DeviceRow>(
    database,
    sql`UPDATE devices
        SET token_hash = ${hashToken(token)},
            token_expires_at = ${expiresAt.toISOString()}::timestamptz
        WHERE id = ${deviceId}
        RETURNING id, name, status, enrolled_at, last_seen_at, token_expires_at`
  );

  if (!rows[0]) return null;

  return { device: mapDeviceRow(rows[0]), token, expires_at: expiresAt.toISOString() };
}
