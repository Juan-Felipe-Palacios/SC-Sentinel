# Changelog del proyecto (+ plantilla)

Formato: Keep a Changelog 1.1 (semantic entries) publicado también en cada GitHub Release.

## [No lanzado]

### Added
- (M0) Estructura inicial del monorepo (agent/, web/, docs/); documentación completa: spec v2.1, 12 ADRs, contratos v1, diagramas, runbooks, testing, ux, legal, release.
- (M2) Ingesta `/api/ingest` en Neon + dashboard v0 (`/dashboard/overview`) con SWR 5 s.
- (M3) Landing pública SSG (`/`, `/funcionalidades`, `/security`, `/contacto`, `/legal/privacy`, `/legal/terms`, `/legal/third-party-notices`), `sitemap.xml`, `robots.txt`, OG image y Vercel Web Analytics.
- (M3) IA asistente por lotes: tabla `ai_insights` (retención 15 d), `/api/ai/analyze`, `/api/ai/cron`, dedup por `facts_hash` y fallback determinista `degraded`; panel «Análisis IA» en el dashboard (refresh 30 s).

### Fixed
- (M3) El lector de `recommendations_json` devolvía `findings: []` al leer el formato objeto `{ findings, recommendations }`.
- (M3) `/api/query?metric=ai` ya no consulta la base con `device_id` vacío cuando no hay device resuelto.
- (M3) Runbook de limpieza: columnas correctas (`flow_windows.start_at`, `agent_health.recorded_at`).

## Plantilla (copiar al preparar release)

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- ...
### Changed
- ...
### Fixed
- ...
### Security
- ...             # (ej: rotación de secret, CVE cerrado de dependencia)
### Breaking      # solo si bump major o cambio rompiente en pre-1.0
- migraciones/nuevos pasos necesarios
```

## Reglas

1. Una entrada por release: preparar PR **antes** del tag (checklist `testing/release-checklist.md`).
2. Cada entrada se refiere al usuario/operador reads: runbook actualizado, pasos de upgrade del agente, cambios del API/dashboards.
3. Cambios de contratos y schemas se narran igualmente (schema_version: ¿v1 sigue? ¿v2 con plan de compatibilidad?).
4. Refs de issues/PRs cuando existan.
5. Comentarios de seguridad SIEMPRE cuentan: si un release incluye fix de Vectores conocidos (cargo audit / npm audit), generar entrada Security.
