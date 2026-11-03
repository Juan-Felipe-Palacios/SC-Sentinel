# Release checklist

Aplica a cada tag `vX.Y.Z` (SemVer estricto: breaking=major · features=minor · fixes=patch, spec §15.2).

## 1. Pre-release (en la branch que va a release)

- [ ] CI verde en todos los jobs (rust.yml en windows+ubuntu, web.yml, contracts.yml).
- [ ] `cargo audit` y `cargo deny check` sin advertencias críticas nuevas.
- [ ] Contratos: los 4 schemas + 4 ejemplos pasan; zod↔serde fixtures en verde en ambos lados.
- [ ] Golden tests de agregación revisados (diff de snapshots aceptado conscientemente).
- [ ] CHANGELOG actualizado (`docs/release/changelog.md`) con entrada de la versión.
- [ ] Documentación actualizada si el comportamiento cambió: spec (changelog §C si aplica), runbooks, ADRs nuevos.
- [ ] Versiones consistentes: `agent/Cargo.toml` workspace version, `web/package.json`, refs en docs.
- [ ] No hay secrets en código/config de ejemplo (grep de `sk-`, tokens, `OPENROUTER`, `CRON_SECRET`).

## 2. Build y artefactos

- [ ] Tag creado: `git tag -a vX.Y.Z -m "..."`.
- [ ] CI genera los artefactos con formato del spec:
  - `sc-sentinel-agent-vX.Y.Z-windows-x64.zip`
  - `sc-sentinel-agent-vX.Y.Z-linux-x64.tar.gz`
  - `SHA256SUMS.txt` (hashes de TODOS los binarios, generado por CI).
- [ ] Binarios probados en máquina limpia (o VM): instalar, capturar 2 min, verificar ingesta, desinstalar.

## 3. Firma (fase actual: plan registrada)

- v1: sin firma de binarios (proceso en `release/signing.md`); solo SHA256SUMS.
- Si firma está activa: verificar firma antes de publicar y subir el certificado/clave solo del environment de CI protegido.

## 4. Deployment web (Vercel)

- [ ] Deploy de producción desde main (o pipeline manual del release) verde.
- [ ] Env de producción presente: `OPENROUTER_API_KEY`, `CRON_SECRET`, secret de sesión admin (SOLO env server-side).
- [ ] Neon: migraciones aplicadas en main branch; verificación de schemas.
- [ ] Crons activos: `/api/ai/cron` cada 5 min (o plan B externo) y `/api/cron/cleanup` diario 03:00 UTC.
- [ ] Smoke post-deploy: ingest de prueba (con token de test), dashboard carga, IA responde (o degraded documentado).

## 5. Publicación

- [ ] GitHub Release creado (artefactos + SHA256SUMS + notas del changelog).
- [ ] Marcar el release como pre-release si es alpha/beta; sólo stable en `vX.0.0`+.
- [ ] Comunicar al propietario con: qué cambió, riesgos, pasos de upgrade (runbooks si afectan a agente instalado).
