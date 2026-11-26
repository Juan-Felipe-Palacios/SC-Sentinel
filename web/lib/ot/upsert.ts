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
  /** Los aporta el lote (`UpsertOtAssetsInput`); si vienen, el lote manda. */
  deviceId?: string;
  hostKey: string;
  /** Idem `deviceId`: la ventana del lote es la autoridad. */
  windowEnd?: Date;
  firstSeen?: Date;
  role?: 'client' | 'server' | 'both' | 'unknown';
  protocols?: string[];
  peers?: string[];
  riskFlags?: string[];
}

/** Activo sin los datos del lote: los aporta la ventana que lo contiene. */
export type OtAssetSeed = Omit<OtAssetInput, 'deviceId' | 'windowEnd'>;

export interface UpsertOtAssetsInput {
  deviceId: string;
  windowEnd: Date;
  /** Cada activo puede traer los campos del lote, pero no los necesita. */
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

/**
 * Un único statement para todos los activos de la ventana.
 *
 * El criterio de E7 es ≤3 statements extra por ingest, así que no se puede
 * emitir un `INSERT` por host. En un `INSERT ... VALUES (...), (...)` la cláusula
 * `ON CONFLICT ... DO UPDATE ... WHERE` se evalúa por fila, así que la guarda
 * `WHERE ot_assets.last_seen < EXCLUDED.last_seen` sigue impidiendo que un
 * reintento de la misma ventana incremente `seen_windows`.
 *
 * Devuelve `null` cuando no hay activos: no se agrega un statement vacío.
 */
export function buildOtAssetsUpsertStatement(
  sql: SqlTag,
  input: UpsertOtAssetsInput
): unknown | null {
  if (input.assets.length === 0) return null;

  const segments: string[] = [];
  const values: unknown[] = [];
  const literal = (text: string) => {
    if (segments.length === 0) segments.push(text);
    else segments[segments.length - 1] += text;
  };
  const bind = (value: unknown) => {
    segments.push('');
    values.push(value);
  };

  literal(
    'INSERT INTO ot_assets (id, device_id, host_key, first_seen, last_seen, seen_windows, ' +
      'role, protocols, peers, risk_flags) VALUES '
  );

  input.assets.forEach((asset, index) => {
    if (index > 0) literal(', ');
    const firstSeen = asset.firstSeen ?? input.windowEnd;
    literal('(');
    bind(stableId('ota', input.deviceId, asset.hostKey));
    literal(', ');
    bind(input.deviceId);
    literal(', ');
    bind(asset.hostKey);
    literal(', ');
    bind(firstSeen.toISOString());
    literal('::timestamptz, ');
    bind(input.windowEnd.toISOString());
    literal('::timestamptz, ');
    literal('1, ');
    bind(asset.role ?? 'unknown');
    literal(', ');
    bind(JSON.stringify(asset.protocols ?? []));
    literal('::jsonb, ');
    bind(JSON.stringify(asset.peers ?? []));
    literal('::jsonb, ');
    bind(JSON.stringify(asset.riskFlags ?? []));
    literal('::jsonb)');
  });

  literal(`
      ON CONFLICT (device_id, host_key) DO UPDATE SET
        last_seen = EXCLUDED.last_seen,
        seen_windows = ot_assets.seen_windows + 1,
        role = EXCLUDED.role,
        protocols = EXCLUDED.protocols,
        peers = EXCLUDED.peers,
        risk_flags = EXCLUDED.risk_flags
      WHERE ot_assets.last_seen < EXCLUDED.last_seen`);

  return sql(segments as unknown as TemplateStringsArray, ...values);
}