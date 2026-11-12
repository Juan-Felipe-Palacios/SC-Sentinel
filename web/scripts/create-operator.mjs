#!/usr/bin/env node
// Crea o actualiza una cuenta de operador. La contraseña se toma del entorno
// para no dejarla en el historial del shell ni en la lista de procesos.

import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
const email = process.env.OPERATOR_EMAIL?.trim().toLowerCase();
const name = process.env.OPERATOR_NAME?.trim();
const password = process.env.OPERATOR_PASSWORD;

if (!url || !email || !name || !password) {
  console.error('Uso: DATABASE_URL=... OPERATOR_EMAIL=... OPERATOR_NAME=... OPERATOR_PASSWORD=... pnpm operator:create');
  process.exit(1);
}
if (password.length < 12) {
  console.error('OPERATOR_PASSWORD debe tener al menos 12 caracteres.');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const passwordHash = `scrypt$16384$8$1$${salt}$${hash}`;
const sql = neon(url);

try {
  const rows = await sql`
    INSERT INTO operators (id, email, name, password_hash)
    VALUES (${`op_${randomUUID()}`}, ${email}, ${name}, ${passwordHash})
    ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          status = 'active',
          updated_at = now()
    RETURNING id, email, name, status
  `;
  console.log(JSON.stringify({ ok: true, operator: rows[0] }, null, 2));
} catch (error) {
  console.error('No se pudo crear el operador:', error instanceof Error ? error.message : error);
  process.exit(1);
}