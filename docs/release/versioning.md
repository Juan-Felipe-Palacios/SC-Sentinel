# Versionado (SemVer)

Regla del spec §15.2: **SemVer estricto** — breaking = major · features = minor · fixes = patch. Versión compartida por agente y web en v1 (monorepo, ADR-0001).

## Dónde vive la versión

| Superficie | Fuente |
|---|---|
| Releases de GitHub | tag git `vX.Y.Z` (formato exacto: `v0.1.0`) |
| Agente | `agent/Cargo.toml` en `workspace.package.version` (los crates heredan) |
| Web | `web/package.json` `"version"` |
| Payload del agente | campo `device.agent_version` (contrato `ingest-api.v1.md`) — debe coincidir con el binario |
| Manifest DB | columna `ingest_batches.schema_version` (contrato versionado por separado: `v: 1`) |

**Regla importante:** el versionado del **contrato** (`v: 1`, schemas `*.v1.*`) es independiente del SemVer de la app. Un cambio de contrato implica: bump de versión de schema (nueva `v2` coexistente o PR conjunto agente+web), actualización de fixtures, changelog, y plan de compatibilidad de batches en spool.

## Reglas de bump por componente

| Cambio | Bump | Ejemplo |
|---|---|---|
| Contrato nuevo campo obligatorio | minor + verificación de tolerancia en agente viejo (defaults) | v0.2.0 |
| Cambio blockante el spool/DB schema | migración en repo + minor (o major si rompe compatibilidad) | v1.0.0 |
| Nueva regla en sc-detect | minor | "Nueva regla dns-tunnel-v2" |
| Fix de backoff / drop métrica | patch | v0.1.1 |
| Cambio de path de tablas/JSON | major (break de lecturas) | v1.0.0 |

## Régimen pre-1.0 (v0.x)

- Todo release v0.x puede incluir breaking changes (estándar SemVer §4).
- Solo se marca release estable (v1.0.0) cuando los hitos M0–M5 están cerrados y el smoke real corrió una semana sin incidencia (`testing/release-checklist.md` full pass).

## Proceso de tag (orden obligatorio)

```bash
# 1. bump de versiones en Cargo.toml + package.json (PR) 
# 2. CHANGELOG actualizado
# 3. merge a main
git tag -a v0.1.0 -m "SC-Sentinel v0.1.0"
git push origin main --tags
# 4. workflow de release construye artefactos + SHA256SUMS y crea el GitHub Release
```

El paso 4 lo ejecuta `.github/workflows/release.yml`: se dispara con el push del tag `v*`
(o a mano con `workflow_dispatch` + input `tag`), compila en Windows y Ubuntu, llama a
`scripts/package-release.ps1` y publica `sc-sentinel-agent-vX.Y.Z-windows-x64.zip`,
`sc-sentinel-agent-vX.Y.Z-linux-x64.tar.gz` y `SHA256SUMS.txt` en la release.

Si la release ya existe (por ejemplo, creada a mano antes de que corriera el CI), el
workflow sube los artefactos con `--clobber`: no duplica, los reemplaza.
