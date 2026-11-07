// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Enrolamiento manual de devices (ADR-0010, M3.1): listar, crear y eliminar.
// El token en claro solo existe en la respuesta de creación: en la base
// se guarda únicamente su SHA-256 (lib/auth/token.ts). No expira ni se rota:
// es permanente hasta que el device se elimina.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { hashToken } from '@/lib/auth/token';
import { defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';

/** Estado inicial: pasa a `active` con el primer ingest exitoso. */
export const DEVICE_STATUS_ENROLLED_PENDING = 'enrolled_pending';

export interface DeviceRecord {
  id: string;
  name: string | null;
  status: string;
  enrolled_at: string;
  last_seen_at: string | null;
}

export interface Enrollment {
  device: DeviceRecord;
  /** Token en claro: se muestra una sola vez y no se puede recuperar después. */
  token: string;
}

interface DeviceRow {
  id: string;
  name: string | null;
  status: string;
  enrolled_at: Date | string;
  last_seen_at: Date | string | null;
}

function mapDeviceRow(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name ?? null,
    status: row.status,
    enrolled_at: isoOrNull(row.enrolled_at) ?? String(row.enrolled_at),
    last_seen_at: isoOrNull(row.last_seen_at),
  };
}

function newToken(): string {
  return `sc_dev_${randomUUID()}`;
}

/** Devices enrolados, del más antiguo al más reciente (v1 single-device). */
export async function listDevices(database: QueryDb = defaultQueryDb): Promise<DeviceRecord[]> {
  const rows = await queryRows<DeviceRow>(
    database,
    sql`SELECT id, name, status, enrolled_at, last_seen_at
        FROM devices
        ORDER BY enrolled_at ASC`
  );
  return rows.map(mapDeviceRow);
}

/** Device puntual por id (validación de la allowlist de visitantes). */
export async function getDeviceById(
  deviceId: string,
  database: QueryDb = defaultQueryDb
): Promise<DeviceRecord | null> {
  const rows = await queryRows<DeviceRow>(
    database,
    sql`SELECT id, name, status, enrolled_at, last_seen_at
        FROM devices
        WHERE id = ${deviceId}
        LIMIT 1`
  );
  return rows[0] ? mapDeviceRow(rows[0]) : null;
}

/**
 * Crea un device en estado `enrolled_pending` con un token permanente.
 * El token devuelto no se persiste: solo su hash.
 */
export async function enrollDevice(
  input: { name?: string | null } = {},
  database: QueryDb = defaultQueryDb,
  now: Date = new Date()
): Promise<Enrollment> {
  const deviceId = `dev_${randomUUID()}`;
  const token = newToken();
  const trimmedName = input.name?.trim();
  const name = trimmedName ? trimmedName.slice(0, 120) : null;

  const rows = await queryRows<DeviceRow>(
    database,
    sql`INSERT INTO devices (id, token_hash, name, status)
        VALUES (
          ${deviceId},
          ${hashToken(token)},
          ${name},
          ${DEVICE_STATUS_ENROLLED_PENDING}
        )
        RETURNING id, name, status, enrolled_at, last_seen_at`
  );

  const device = rows[0]
    ? mapDeviceRow(rows[0])
    : {
        id: deviceId,
        name,
        status: DEVICE_STATUS_ENROLLED_PENDING,
        enrolled_at: now.toISOString(),
        last_seen_at: null,
      };

  return { device, token };
}

/**
 * Elimina el device y todos sus datos asociados de forma permanente.
 *
 * Las FK obligan a borrar hijos antes que el padre, pero un solo statement
 * (CTE) mantiene la operación atómica: si algo falla, no queda un device a
 * medio borrar. Las tablas sin FK (alerts, host_stats) se limpian por el
 * `window_id` lógico de las ventanas del device (flow_windows.window_id),
 * que es la columna que ambas referencian.
 */
export async function deleteDevice(
  deviceId: string,
  database: QueryDb = defaultQueryDb
): Promise<boolean> {
  const rows = await queryRows<{ id: string }>(
    database,
    sql`WITH device_windows AS (
          SELECT window_id FROM flow_windows WHERE device_id = ${deviceId}
        ),
        deleted_alerts AS (
          DELETE FROM alerts WHERE window_id IN (SELECT window_id FROM device_windows)
        ),
        deleted_host_stats AS (
          DELETE FROM host_stats WHERE window_id IN (SELECT window_id FROM device_windows)
        ),
        deleted_ai_insights AS (
          DELETE FROM ai_insights WHERE device_id = ${deviceId}
        ),
        deleted_agent_health AS (
          DELETE FROM agent_health WHERE device_id = ${deviceId}
        ),
        deleted_flow_windows AS (
          DELETE FROM flow_windows WHERE device_id = ${deviceId}
        ),
        deleted_ingest_batches AS (
          DELETE FROM ingest_batches WHERE device_id = ${deviceId}
        )
        DELETE FROM devices WHERE id = ${deviceId}
        RETURNING id`
  );

  return rows.length > 0;
}
