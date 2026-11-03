// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

// Lazy safe proxy avoiding build-time throw when evaluating routes
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const database = getDb();
    return (database as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export * from './schema';
