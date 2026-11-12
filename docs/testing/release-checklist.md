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
- [ ] Coherencia de versiones verificada: `pwsh ./scripts/check-doc-versions.ps1` (el mismo gate corre en el workflow de release y corta la publicación si una guía apunta a otra release).
- [ ] No hay secrets en código/config de ejemplo (grep de `sk-`, tokens, `OPENROUTER`, `CRON_SECRET`).

## 2. Build y artefactos

- [ ] Tag creado: `git tag -a vX.Y.Z -m "..."`.
- [ ] CI genera los artefactos con formato del spec:
  - `sc-sentinel-agent-vX.Y.Z-windows-x64.zip`
  - `sc-sentinel-agent-vX.Y.Z-linux-x64.tar.gz`
  - `SHA256SUMS.txt` (hashes de TODOS los binarios, generado por CI).
- [ ] Artefacto verificado con el script: `pwsh ./scripts/verify-agent.ps1 -ZipPath <zip>` → hash, 8 ficheros, sumas internas, `--version`, `--list-interfaces` con la captura live, higiene del binario y arranque con GeoLite2. Debe salir "TODO CORRECTO" y código 0.
- [ ] Binarios probados en máquina limpia (o VM): instalar, capturar 2 min, verificar ingesta, desinstalar.
- [ ] Instalador de un clic probado de verdad: doble clic en `instalar-sc-sentinel.bat` (o modo desatendido con `<device_id> <token>`), UAC aceptado, servicio «SC Sentinel Network Agent» en ejecución, puertos 2055/4739 abiertos y `SC_INGEST_TOKEN`/`SC_SENTINEL_DEVICE_ID` en el `Environment` del servicio.
- [ ] Instalación verificada con `pwsh ./scripts/verify-agent.ps1 -SkipPackage -Service` **como administrador** → servicio Running, 3 acciones de recovery, binPath con `--config`/`--no-capture`, `.host-key`, spool, log con `GeoIP: base GeoLite2 cargada` y sockets UDP del colector abiertos.
- [ ] `desinstalar-sc-sentinel.bat` probado: servicio eliminado (`sc.exe query` → 1060), sin residuos en `C:\Program Files` ni en `C:\ProgramData`.

## 3. Firma (fase actual: plan registrada)

- v1: sin firma de binarios (proceso en `release/signing.md`); solo SHA256SUMS.
- Si firma está activa: verificar firma antes de publicar y subir el certificado/clave solo del environment de CI protegido.

## 4. Deployment web (Vercel)

- [ ] Deploy de producción desde main (o pipeline manual del release) verde.
- [ ] Env de producción presente: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `AI_PROVIDER`, `CRON_SECRET`, secret de sesión admin (SOLO env server-side).
- [ ] Neon: migraciones aplicadas en main branch; verificación de schemas.
- [ ] Crons activos: `/api/ai/cron` cada 15 min vía GitHub Actions (`ai-cron.yml`) y `/api/cron/cleanup` diario 03:00 UTC.
- [ ] Smoke post-deploy: ingest de prueba (con token de test), dashboard carga, IA responde (o degraded documentado).

## 5. Publicación

- [ ] GitHub Release creado (artefactos + SHA256SUMS + notas del changelog).
- [ ] Marcar el release como pre-release si es alpha/beta; sólo stable en `vX.0.0`+.
- [ ] Comunicar al propietario con: qué cambió, riesgos, pasos de upgrade (runbooks si afectan a agente instalado).
