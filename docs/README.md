# Documentación SC-Sentinel (índice)

**Producto:** Strategic Connex Anomaly Shield (SC-Sentinel) · **Propiedad:** Strategic Connex (software propietario) · **Dominio:** sc-sentinel.vercel.app (ADR-0012)

**Fuente de verdad:** [`superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md`](superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md) (v2.2, aprobada 2026-11-03; consolidación IA free-tier 2026-11-08). El resto de la documentación se deriva de él y se mantiene sincronizada por checklist (ver “Reglas de mantenimiento” abajo).

## Mapa

| Directorio | Contenido | Autoridad |
|---|---|---|
| `superpowers/specs/` | Spec completo v2.2 (fuente de verdad) + diseño de producto previo (superseded, histórico) | — |
| `superpowers/plans/` | 8 planes de ejecución: M0, M1, M2, M3, M4, M5 y Ruta B v1/v2 | spec §13 |
| `adr/` | 14 decisiones de arquitectura (0001–0014) | spec §3 |
| `rfc/` | RFCs (propuestas): README + plantilla 0000; numeración 0001+ | proceso |
| `contracts/` | contratos `/api/ingest` v1 y `/api/chat` v1 + 3 schemas JSON + 4 ejemplos en `examples/` | spec §5, §6 |
| `diagrams/` | 12 mermaid en `mermaid/` + 4 drawio en `drawio/` + reglas de exports (`README.md` propio) | spec §17 |
| `architecture/` | C4 overview (L1–L3), data-flow (DFD), decisiones (atajo a `adr/`) | spec §3, §17 |
| `operations/` | deployment, alert-lifecycle, slo, observability (complementan `runbooks/`) | spec §8, §9, §12 |
| `tutorials/` | quickstart del agente y del dashboard | onboarding |
| `how-to/` | rotación de secretos, debug de ingest, backup/restore, reglas, upgrade | operación |
| `explanation/` | threat-model, privacidad/retención, IA determinista, caching | spec §3 |
| `governance/` | contribución, versionado | proceso |
| `reference/` | api-contracts, data-model (ERD), detection-rules | spec §5, §6 |
| `visuals/` | risk-score-calculation, multi-tenant-future | spec §17 |
| `runbooks/` | 11: local-dev, inst. Windows/Linux, troubleshoot pcap/sync, colector MikroTik/Cisco, rotación token, cleanup DB, incident-response, rotación Trust Pages, export datasets grandes | spec §8, §9, §12, §13 |
| `testing/` | 6 docs (test-plan, acceptance-criteria por hito, fixtures, release-checklist, throughput-benchmark, pcap-vs-flow) + `fixtures/` con capturas pcap/NetFlow/IPFIX | spec §14, §15 |
| `ux/` | 6: landing-sitemap, dashboard-wireframes, design-tokens, copywriting, login-drone-show y prototipo M3.5 (HTML) | spec §18 |
| `legal/` | THIRD_PARTY_NOTICES, maxmind-notice, npcap-notice, privacidad (draft), términos (draft) | licencias §3 del spec |
| `release/` | versioning, changelog, signing, deployment | spec §15, §20 |
| `security/` | Auditorías de seguridad: hallazgos priorizados, parches y plan de ejecución | — |
| `ai-evals-metrics.md` | Definición de métricas de AI Evals (coste, latencia, tasa de éxito) | Ruta B v2 |
| `atlas.pdf` | Atlas de documentación completo en A4 vectorial (91 docs + 12 diagramas SVG) | visual docs |
| `diagrams/exports/*.dxf` | 12 diagramas en formato CAD (DXF) vectorial | visual docs |

## Rutas de la aplicación

Verificado contra `web/app/` (páginas y handlers reales):

- **Páginas:** `/`, `/funcionalidades`, `/security`, `/contacto`, `/legal/privacy`, `/legal/terms`, `/legal/third-party-notices`, `/login`, `/p/[token]`, `/dashboard/overview`, `/dashboard/hosts`, `/dashboard/connections`, `/dashboard/alerts`, `/dashboard/evals`, `/dashboard/settings`, `/dashboard/admin/exports`, `/dashboard/admin/trust-access`.
- **Entradas especiales:** `/demo` (handler que crea la sesión de visitante y redirige al dashboard), `/dashboard` (redirige a `/demo` sin sesión).
- **APIs:** `/api/ingest`, `/api/query`, `/api/chat` y `/api/chat/history`, `/api/auth/{login,logout,guest-login}`, `/api/devices` y `/api/devices/{enroll,[id]}`, `/api/ai/{analyze,cron}`, `/api/cron/cleanup`, `/api/export` y `/api/export/stats`, `/api/trust` y `/api/trust/access`.

Módulos que sostienen estas rutas: `web/lib/export`, `web/lib/ai/metrics.ts` y `web/lib/trust`.

## Reglas de mantenimiento

1. **Cambio de contrato** = tocar en el mismo PR: spec (si corresponde) + `contracts/*` (schema y ejemplos) + contratos zod↔serde en agent/web + fixtures de tests (ADR-0001). La CI de contratos (`contracts.yml`) falla si está desbalanceado.
2. **Decisión nueva** = ADR nuevo con número siguiente (0015, 0016… formato: número-nombre-kebab). Los ADRs no se editan retroactivamente salvo aclaración con nota.
3. **Cambio de retención/sizing/tokens** = actualizar spec + runbook/doc hijos que lo coticen, en el mismo PR.
4. Los drafts legales (privacidad, términos) NO se publican a producción sin revisión (M3, checklist propio del draft).
5. Idioma: español internacional profesional (la misma voz editorial de la landing y runbooks).
6. **Este índice es verificable:** todo directorio de `docs/` aparece en el mapa y los conteos coinciden con el árbol. Al crear, mover o borrar un documento, actualizar mapa y estado en el mismo PR.

## Estado de esta documentación

| Grupo | Estado | Alineado con hito |
|---|---|---|
| superpowers/specs/ | ✅ v2.2 (consolidación IA free-tier 2026-11-08) | base |
| superpowers/plans/ | ✅ 8 planes (M0–M5, Ruta B v1/v2) | M0–M5 |
| adr/ | ✅ 14 ADRs (0001–0014) | M0, M3.5, M4 |
| rfc/ | ✅ plantilla + índice (sin RFCs aún) | proceso |
| contracts/ | ✅ v1 congelados (3 schemas + 4 ejemplos) | M0 |
| diagrams/ | ✅ 17 fuentes (12 mermaid + 4 drawio + exports) | M0–M5 + visual docs |
| architecture/ | ✅ C4 + DFD + atajo ADRs | visual docs |
| operations/ | ✅ deployment + alert-lifecycle | visual docs |
| reference/ | ✅ api-contracts + data-model + detection-rules | visual docs |
| visuals/ | ✅ risk-score + multi-tenant-future | visual docs |
| tutorials/ | ✅ 2 quickstarts | onboarding |
| how-to/ | ✅ 5 guías | operación |
| explanation/ | ✅ 4 explicaciones | spec §3 |
| governance/ | ✅ contribución + versionado | proceso |
| runbooks/ | ✅ 15 escritos (verificados contra instalación real; pendiente el ciclo físico con el instalador curado) | M1–M5 |
| testing/ | ✅ 6 docs + fixtures binarios | M0–M5 |
| ux/ | ✅ 6 (tokens de marca: valores definidos en la extracción M3) | M3, M3.5 |
| legal/ | ✅ 5 (2 drafts pendientes de revisión legal antes de M3) | M3 |
| release/ | ✅ 4 | M2–M5 |
| security/ | ✅ auditoría 2026-11-09 (altos H1–H7 y M1/M2/M5/M8 + M3/M6/M7 corregidos; M4 y L1–L5 pendientes) | transversal |

**Última revisión del índice:** 2026-11-09 — consolidación con el árbol real (rutas, conteos y fuente de verdad corregida).
