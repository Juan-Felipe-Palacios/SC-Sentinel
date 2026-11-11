# Gobernanza — versionado

## Esquema

- **Agente (Rust):** SemVer (`MAJOR.MINOR.PATCH`). Binarios firmados en GitHub Releases.
- **Web (Next.js):** despliegue continuo en Vercel; versión en `package.json` solo informativa.
- **Contratos de API:** versionados en la ruta (`/api/ingest` v1). Cambios breaking = nueva versión + período de deprecación.
- **Base de datos:** migraciones aditivas; nunca destructivas sin plan de rollback.

## Changelog

`docs/release/changelog.md` sigue Keep a Changelog. Cada release documenta added/changed/fixed/security.

## Deprecación

- Anunciar con al menos un release de anticipación.
- Mantener endpoints viejos funcionando durante el período.
- Documentar en `docs/reference/api-contracts.md`.