# How-to — backup y restore de Neon

## Backup

- Neon ofrece point-in-time restore (PITR) por rama. Crear una rama `backup-<fecha>` antes de migraciones de release.
- Export lógico: `pg_dump "$DATABASE_URL" > backup.sql` (schema + datos). Guardar fuera del repo (no commitear).
- Retención: alinear con la política de 30 días de `flow_windows`/`alerts`.

## Restore

1. Crear una rama nueva en Neon desde el backup.
2. Apuntar `DATABASE_URL` de Preview a la rama restaurada.
3. Verificar `/api/query` y `/dashboard/overview`.
4. Promover a Production solo tras validación.

## DR (disaster recovery)

- RPO objetivo: ≤ 1 h (PITR de Neon).
- RTO objetivo: ≤ 4 h (redeploy + restore).
- Documentar el último drill en este archivo con fecha y resultado.