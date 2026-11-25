// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//
// Upsert de `ot_assets` a partir del bloque `ot` de un WindowSnapshot.
//
// Patrón (ADR-0008 + ADR-0015, §5.3 del plan M6):
//   - Ids deterministas con stableId + ON CONFLICT DO NOTHING = idempotente.
//   - Excepción para contadores (seen_windows): ON CONFLICT (device_id, host_key)
//     DO UPDATE … WHERE last_seen = window_end, para que un reintento del agente
//     no incremente el contador dos veces.

import { createHash } from 'crypto';

/** Etiqueta `sql` del driver de Neon (o un doble en tests). */
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => unknown;

export interface OtAssetInput {
  deviceId: string;
  hostKey: string;
  windowEnd: Date;
  firstSeen?: Date;
  role?: 'client' | 'server' | 'both' | 'unknown';
  protocols?: string[];
  peers?: string[];
  riskFlags?: string[];
}

export interface UpsertOtAssetsInput {
  deviceId: string;
  windowEnd: Date;
  assets: OtAssetInput[];
}

/**
 * Determina si un upsert debe ejecutar el DO UPDATE (incrementar seen_windows)
 * o si la fila ya tiene last_seen = windowEnd (reintento idempotente).
 *
 * @param existingLastSeen - last_seen actual en la tabla (null si no existe)
 * @param windowEnd - fin de la ventana actual
 * @returns true si se debe actualizar (nueva ventana o reintento sin duplicar)
 */
export function shouldUpsert(existingLastSeen: Date | null, windowEnd: Date): boolean {
  if (existingLastSeen === null) return true;
  // Si last_seen ya es windowEnd, es un reintento: no incrementar.
  if (existingLastSeen.getTime() === windowEnd.getTime()) return false;
  // Ventana nueva: actualizar.
  return true;
}

export function stableId(prefix: string, ...parts: (string | number)[]): string {
  const hash = createHash('sha256');
  hash.update(parts.join('|'));
  return `${prefix}_${hash.digest('hex').slice(0, 24)}`;
}

/**
 * Construye las sentencias SQL para upsert de ot_assets.
 * Cada asset genera un statement INSERT … ON CONFLICT DO UPDATE con guarda
 * WHERE last_seen = windowEnd para idempotencia del contador.
 */
export function buildUpsertOtAssetsStatements(
  sql: SqlTag,
  input: UpsertOtAssetsInput
): unknown[] {
  const statements: unknown[] = [];

  for (const asset of input.assets) {
    const assetId = stableId('ota', input.deviceId, asset.hostKey);
    const firstSeen = asset.firstSeen ?? input.windowEnd;
    const role = asset.role ?? 'unknown';
    const protocols = asset.protocols ?? [];
    const peers = asset.peers ?? [];
    const riskFlags = asset.riskFlags ?? [];

    statements.push(sql`
      INSERT INTO ot_assets (id, device_id, host_key, first_seen, last_seen, seen_windows,
                            role, protocols, peers, risk_flags)
      VALUES (${assetId}, ${input.deviceId}, ${asset.hostKey},
              ${firstSeen.toISOString()}::timestamptz, ${input.windowEnd.toISOString()}::timestamptz,
              1, ${role}, ${JSON.stringify(protocols)}::jsonb,
              ${JSON.stringify(peers)}::jsonb, ${JSON.stringify(riskFlags)}::jsonb)
      ON CONFLICT (device_id, host_key) DO UPDATE SET
        last_seen = EXCLUDED.last_seen,
        seen_windows = ot_assets.seen_windows + 1,
        role = EXCLUDED.role,
        protocols = EXCLUDED.protocols,
        peers = EXCLUDED.peers,
        risk_flags = EXCLUDED.risk_flags
      WHERE ot_assets.last_seen < EXCLUDED.last_seen`);

    // Separately, ensure seen_windows is not incremented on retry.
    // The WHERE clause above prevents increment when last_seen == windowEnd.
  }

  return statements;
}