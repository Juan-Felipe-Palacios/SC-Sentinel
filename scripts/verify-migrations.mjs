// scripts/verify-migrations.mjs — verifica tablas 0008-0011 en Neon (solo lectura)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resuelve @neondatabase/serverless desde web/node_modules (root no tiene node_modules).
const require = createRequire(resolve('web/package.json'));
const { neon } = require('@neondatabase/serverless');

const envText = readFileSync(resolve('web/.env.local'), 'utf8');
const url = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error('DATABASE_URL no encontrado en web/.env.local'); process.exit(1); }

const sql = neon(url);
const [tables, cols] = await Promise.all([
  sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('export_logs','trust_pages','trust_page_access_logs') ORDER BY 1`,
  sql`SELECT column_name FROM information_schema.columns WHERE table_name='ai_insights' AND column_name IN ('input_tokens','output_tokens','cost_usd','latency_ms','status_code') ORDER BY 1`,
]);
const expectedTables = ['export_logs', 'trust_page_access_logs', 'trust_pages'];
const gotTables = tables.map((r) => r.table_name);
const expectedCols = ['cost_usd', 'input_tokens', 'latency_ms', 'output_tokens', 'status_code'];
const gotCols = cols.map((r) => r.column_name);
const ok = JSON.stringify(gotTables) === JSON.stringify(expectedTables) && JSON.stringify(gotCols) === JSON.stringify(expectedCols);
console.log('tablas:', gotTables.join(', '));
console.log('ai_insights cols:', gotCols.join(', '));
console.log(ok ? 'VERIFICADO OK' : 'FALTAN OBJETOS');
process.exit(ok ? 0 : 1);
