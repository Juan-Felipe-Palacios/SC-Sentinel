// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Base de datos local de desarrollo (PGlite, PostgreSQL 17 en WASM).
//
// Motivo: trabajar el camino real de la API sin Neon (cuota agotada, sin red o
// sin ganas de gastar CU-horas). Sólo se activa con NODE_ENV != production y
// SC_DEV_DB=pglite; en cualquier otro caso `lib/db/index.ts` sigue usando el
// driver HTTP de Neon y este archivo no toca nada.
//
// PGlite es una devDependency (~4 MB con WASM): se carga con `require` en
// runtime, no con `import` estático, para que no entre en el bundle de
// producción. La ruta del directorio se resuelve contra el cwd de `next dev`
// (`web/`), no contra el cwd del shell.

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';

/** Flag que habilita la base local; cualquier otro valor usa Neon. */
export const LOCAL_DB_FLAG = 'SC_DEV_DB';
/** Variable opcional para mover el directorio de datos. */
export const LOCAL_DB_DIR_ENV = 'SC_DEV_DB_DIR';
/** Directorio por defecto, relativo a `web/` y fuera de git. */
export const LOCAL_DB_DEFAULT_DIR = '.local-db';

export function isLocalDevDbEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env[LOCAL_DB_FLAG] === 'pglite';
}

export function localDevDbDir(): string {
  const configured = process.env[LOCAL_DB_DIR_ENV]?.trim();
  return resolve(process.cwd(), configured && configured.length > 0 ? configured : LOCAL_DB_DEFAULT_DIR);
}

// Specifiers en variables a propósito: con un literal, webpack resuelve el
// `require` y mete PGlite (~911 KB de JS + WASM) en cada función de producción.
const PGLITE_SPECIFIER = '@electric-sql/pglite';
const DRIZZLE_PGLITE_SPECIFIER = 'drizzle-orm/pglite';

let instance: PgliteDatabase<typeof schema> | null = null;

/**
 * Instancia única de PGlite. El constructor es síncrono, así que el proxy de
 * `lib/db` la puede crear en el primer acceso sin volver async la API de
 * Drizzle. Las migraciones y la siembra las aplica
 * `web/scripts/seed-local-dev-db.mjs` (`pnpm dev:seed`); acá no se migra.
 */
export function getLocalDevDb(): PgliteDatabase<typeof schema> {
  if (instance) return instance;

  const require = createRequire(import.meta.url);
  // `require` a propósito: ver el encabezado del archivo.
  const { PGlite } = require(PGLITE_SPECIFIER) as typeof import('@electric-sql/pglite');
  const { drizzle } = require(DRIZZLE_PGLITE_SPECIFIER) as typeof import('drizzle-orm/pglite');

  const client = new PGlite(localDevDbDir());
  instance = drizzle(client, { schema }) as unknown as PgliteDatabase<typeof schema>;
  return instance;
}
