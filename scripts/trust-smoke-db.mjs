// scripts/trust-smoke-db.mjs — utilidades DB para el smoke test Trust (solo lectura/escritura mínima)
// Uso: node scripts/trust-smoke-db.mjs devices
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve('web/package.json'));
const { neon } = require('@neondatabase/serverless');
const url = readFileSync(resolve('web/.env.local'), 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error('DATABASE_URL no encontrado'); process.exit(1); }
const sql = neon(url);

const cmd = process.argv[2];
if (cmd === 'devices') {
  const rows = await sql`SELECT id, name, status FROM devices ORDER BY enrolled_at DESC LIMIT 5`;
  console.log(JSON.stringify(rows, null, 2));
} else if (cmd === 'cleanup-trust') {
  // Limpia páginas trust de prueba creadas por el smoke test
  const rows = await sql`DELETE FROM trust_pages WHERE label LIKE 'smoke-%' RETURNING id, label`;
  console.log(JSON.stringify(rows, null, 2));
} else if (cmd === 'trust-state') {
  const rows = await sql`SELECT id, label, created_at, revoked_at, last_rotated_at FROM trust_pages ORDER BY created_at DESC LIMIT 10`;
  console.log(JSON.stringify(rows, null, 2));
} else if (cmd === 'access-logs') {
  const rows = await sql`SELECT ip_anon, user_agent_hash, count(*)::int AS n FROM trust_page_access_logs GROUP BY 1, 2 ORDER BY n DESC LIMIT 5`;
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.error('comando desconocido');
  process.exit(1);
}
