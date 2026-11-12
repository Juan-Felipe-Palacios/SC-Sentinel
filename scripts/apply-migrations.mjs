// scripts/apply-migrations.mjs — aplica migraciones pendientes a una base Neon.
//
// Motivo: el ingest respondía 500 en cada ventana porque producción estaba en
// la migración 0007 (faltaban 0008–0015: export_logs, evals, trust pages,
// métricas del colector y ciclo de vida de alertas). El INSERT de agent_health
// con columnas del colector fallaba con 42703 dentro del try/catch del route.
//
// Uso:
//   node scripts/apply-migrations.mjs --dry-run            # qué aplicaría
//   node scripts/apply-migrations.mjs                      # aplica en producción
//   node scripts/apply-migrations.mjs --env-file web/.env.local
//   DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
//
// El ledger `sc_schema_migrations` (nombre, applied_at) evita reaplicar. Las
// migraciones del repo no son idempotentes (CREATE TABLE / ADD COLUMN sin
// IF NOT EXISTS), así que el ledger es la fuente de verdad.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve('web/package.json'));
const { neon } = require('@neondatabase/serverless');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

const dryRun = process.argv.includes('--dry-run');
const envFile = arg('--env-file', 'web/.env.production.local');

let url = process.env.DATABASE_URL;
if (!url) {
  const text = readFileSync(resolve(envFile), 'utf8');
  url = text.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)/m)?.[1]?.trim();
}
if (!url) {
  console.error(`DATABASE_URL no encontrada (${envFile} o entorno)`);
  process.exit(1);
}

const sql = neon(url);
const host = url.match(/@([^/]+)/)?.[1] ?? 'desconocido';
console.log(`destino: ${host}${dryRun ? ' (dry-run)' : ''}`);

const dir = resolve('web/lib/db/migrations');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (!dryRun) {
  await sql`CREATE TABLE IF NOT EXISTS sc_schema_migrations (
    name text PRIMARY KEY NOT NULL,
    applied_at timestamptz DEFAULT now() NOT NULL
  )`;
}

const appliedRows = dryRun
  ? []
  : await sql`SELECT name FROM sc_schema_migrations`;
const applied = new Set(appliedRows.map((row) => row.name));

let pending = 0;
let failed = 0;

for (const file of files) {
  if (applied.has(file)) {
    continue;
  }
  const text = readFileSync(resolve(dir, file), 'utf8');
  const statements = text
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !/^(--[^\n]*\n?)+$/.test(statement));

  pending++;
  console.log(`\n==> ${file} (${statements.length} sentencias)`);

  for (const [index, statement] of statements.entries()) {
    const preview = statement.split('\n').find((line) => line.trim() && !line.trim().startsWith('--')) ?? statement;
    if (dryRun) {
      console.log(`  [${index + 1}/${statements.length}] ${preview.slice(0, 90)}`);
      continue;
    }
    try {
      await sql.query(statement);
      console.log(`  [${index + 1}/${statements.length}] OK ${preview.slice(0, 70)}`);
    } catch (error) {
      failed++;
      console.error(`  [${index + 1}/${statements.length}] FALLO: ${error.message}`);
      console.error(`  sentencia: ${statement.slice(0, 300)}`);
      break;
    }
  }

  if (!dryRun && failed === 0) {
    await sql`INSERT INTO sc_schema_migrations (name) VALUES (${file}) ON CONFLICT DO NOTHING`;
  }
  if (failed > 0) {
    break;
  }
}

if (dryRun) {
  console.log(`\npendientes: ${pending}`);
} else {
  console.log(`\naplicadas: ${pending - failed}; fallos: ${failed}`);
}
process.exit(failed > 0 ? 1 : 0);
