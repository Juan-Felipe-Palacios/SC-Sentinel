# Despliegue — GitHub Actions → Vercel + Neon + agente

**Diagrama:** `docs/diagrams/mermaid/deployment.mmd`.

## Flujo

1. **CI en GitHub Actions** (`.github/workflows/`): `cargo test/clippy/audit` (agente), `pnpm typecheck/lint/test/build` (web), `contracts.yml` (paridad zod↔serde), firma de artefactos en release.
2. **Web a Vercel:** build Next.js 15, despliegue automático en push a la rama principal; Preview por PR.
3. **Neon:** migraciones Drizzle aplicadas en el pipeline de release (`web/drizzle`); la app usa `DATABASE_URL` con rol sin DDL en runtime (Anexo A de la auditoría).
4. **Agente:** binarios firmados publicados en GitHub Releases; instalador Windows (servicio `SC-Sentinel-Agent`) y paquete Linux/systemd.
5. **Variables de entorno:** configuradas en Vercel (no en repo). Lista completa en `docs/security/audit-2026-11-09.md` Anexo A.

## Checklist previo a producción

- `pnpm audit --prod --audit-level=high` sin hallazgos altos (H6).
- Cabeceras de seguridad y CSP activas (H7).
- `SC_GUEST_DEVICE_ID` configurado (H2).
- `SC_SESSION_SECRET` ≥ 32 caracteres, distinto de `ADMIN_SECRET` (M1).
- `pnpm typecheck && pnpm lint && pnpm test` en verde.

## Rollback

Revertir el deployment en Vercel a la build anterior; las migraciones de Neon son aditivas (no se revierten automáticamente). Para el agente, reinstalar el binario anterior desde Releases.