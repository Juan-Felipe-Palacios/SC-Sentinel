import { defineConfig } from 'drizzle-kit';

// `out` NO es el ledger ni el directorio que consume el runner. El ledger
// autoritativo es `sc_schema_migrations` (`scripts/apply-migrations.mjs`), y
// `drizzle-kit generate|migrate|push` está prohibido en este repo
// (`docs/runbooks/apply-db-migrations.md`). Este directorio separado evita que un
// `generate` accidental escriba en `web/lib/db/migrations/`.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/drizzle-out',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
