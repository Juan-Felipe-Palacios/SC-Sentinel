// Verificación rápida: columnas collector_* en agent_health (T4.1)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const req = createRequire('D:/ProyectosWeb/SC-Sentinel/web/package.json');
const { neon } = req('@neondatabase/serverless');
const url = readFileSync('D:/ProyectosWeb/SC-Sentinel/web/.env.local', 'utf8')
  .match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error('DATABASE_URL no encontrado en web/.env.local');
  process.exit(1);
}

const sql = neon(url);
const rows = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'agent_health' AND column_name LIKE 'collector%'
  ORDER BY column_name`;
const names = rows.map((r) => r.column_name);
console.log(names.join('\n'));
if (names.length !== 5) {
  console.error(`FAIL: se esperaban 5 columnas, hay ${names.length}`);
  process.exit(1);
}
console.log('VERIFICADO OK: 5 columnas collector_* presentes');
