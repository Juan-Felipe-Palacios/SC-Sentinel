// scripts/verify-migration-ledger.mjs — comprueba drift entre las migraciones del
// repo y el ledger `sc_schema_migrations`. SÓLO LECTURA: no crea la tabla, no
// inserta, no borra y no aplica migraciones.
//
// Uso:
//   node scripts/verify-migration-ledger.mjs
//   node scripts/verify-migration-ledger.mjs --env-file web/.env.local
//   DATABASE_URL=postgres://... node scripts/verify-migration-ledger.mjs
//
// Ejecutar desde la raíz del repo: resuelve `web/package.json` y
// `web/lib/db/migrations`.
//
// Sale con código 0 si archivos y ledger coinciden, y con 1 si hay pendientes,
// filas huérfanas o un error de lectura. La tabla `drizzle.__drizzle_migrations`
// se informa sólo como dato: NO es autoritativa (ver
// docs/runbooks/apply-db-migrations.md).
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve('web/package.json'));
const { neon } = require('@neondatabase/serverless');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

const envFile = arg('--env-file', 'web/.env.production.local');

let url = process.env.DATABASE_URL;
if (!url) {
  let text;
  try {
    text = readFileSync(resolve(envFile), 'utf8');
  } catch {
    console.error(`No se pudo leer --env-file ${envFile}`);
    process.exit(1);
  }
  url = text.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)/m)?.[1]?.trim();
}
if (!url) {
  console.error(`DATABASE_URL no encontrada (${envFile} o entorno)`);
  process.exit(1);
}

const sql = neon(url);
// Sólo el host: nunca el usuario, la contraseña ni la query del DSN. `URL`
// separa el userinfo en el último `@`, así que una contraseña con `@` sin
// codificar no se imprime como si fuera parte del host.
let host = 'desconocido';
try {
  host = new URL(url).host || 'desconocido';
} catch {
  // DSN no parseable: se informa como desconocido, sin volcar la URL.
}
console.log(`destino: ${host} (sólo lectura)`);

const dir = resolve('web/lib/db/migrations');
let files;
try {
  files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
} catch (error) {
  console.error(`FALLO: no se pudo leer web/lib/db/migrations: ${error.message}`);
  process.exit(1);
}

let rows;
try {
  rows = await sql`SELECT name FROM sc_schema_migrations ORDER BY name`;
} catch (error) {
  console.error(`FALLO: no se pudo leer sc_schema_migrations: ${error.message}`);
  console.error('La tabla la crea scripts/apply-migrations.mjs; este checker no escribe.');
  process.exit(1);
}

const applied = new Set(rows.map((row) => row.name));
const onDisk = new Set(files);
const pending = files.filter((file) => !applied.has(file));
const orphaned = rows.map((row) => row.name).filter((name) => !onDisk.has(name));

let drizzleCount = 'no disponible';
try {
  const result = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  drizzleCount = result[0]?.n ?? 'no disponible';
} catch {
  // El esquema `drizzle` puede no existir; es un dato informativo, no un fallo.
}

console.log(
  `archivos: ${files.length}; ledger: ${rows.length}; drizzle (dato, no autoridad): ${drizzleCount}`
);

if (pending.length > 0) {
  console.log(`pendientes (${pending.length}):`);
  for (const file of pending) console.log(`  - ${file}`);
}

if (orphaned.length > 0) {
  console.log(`huérfanas en el ledger (${orphaned.length}):`);
  for (const name of orphaned) console.log(`  - ${name}`);
}

if (pending.length === 0 && orphaned.length === 0) {
  console.log('sin drift: archivos y ledger coinciden');
  process.exit(0);
}

console.log('drift detectado: no edites el ledger a mano sin seguir el runbook.');
process.exit(1);
