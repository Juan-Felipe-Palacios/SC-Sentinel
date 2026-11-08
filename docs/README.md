# Documentación SC-Sentinel (índice)

**Producto:** Strategic Connex Anomaly Shield (SC-Sentinel) · **Propiedad:** Strategic Connex (software propietario) · **Dominio:** sc-sentinel.vercel.app (ADR-0012)

**Fuente de verdad:** `specs/SC-Sentinel-Spec-Completo-2026-11-03.md` (v2.2). El resto de la documentación se deriva de él y se mantiene sincronizada por checklist (ver "Reglas de mantenimiento" abajo).

## Mapa

| Directorio | Contenido | Autoridad |
|---|---|---|
| `adr/` | 13 decisiones de arquitectura (0001–0013) | espec §3 |
| `contracts/` | contratos `/api/ingest` v1 y `/api/chat` v1 + 3 schemas JSON + 4 ejemplos | spec §5, §6 |
| `diagrams/` | 7 mermaid `.mmd` + 4 drawio + reglas de exports (`README.md` propio) | spec §17 |
| `runbooks/` | 8: local-dev, inst. Windows/Linux, troubleshoot pcap/sync, rotación token, cleanup DB, incident-response | spec §8, §9, §12, §13 |
| `testing/` | test-plan, acceptance-criteria por hito, fixtures, release-checklist | spec §14, §15 |
| `ux/` | landing-sitemap, dashboard-wireframes, design-tokens, copywriting | spec §18 |
| `legal/` | THIRD_PARTY_NOTICES, maxmind-notice, npcap-notice, privacidad (draft), términos (draft) | licencias §3 del spec |
| `release/` | versioning, changelog, signing, deployment | spec §15, §20 |
| `specs/` | Spec-Completo v2.2 (actual) + archive de v1.0 (superseded) | — |

## Reglas de mantenimiento

1. **Cambio de contrato** = tocar en el mismo PR: spec (si corresponde) + `contracts/*` (schema y ejemplos) + contratos zod↔serde en agent/web + fixtures de tests (ADR-0001). La CI de contratos (`contracts.yml`) falla si está desbalanceado.
2. **Decisión nueva** = ADR nuevo con número siguiente (0009, 0010… formato: número-nombre-kebab). Los ADRs no se editan retroactivamente salvo aclaración con nota.
3. **Cambio de retención/sizing/tokens** = actualizar spec + runbook/doc hijos que lo coticen, en el mismo PR.
4. Los drafts legales (privacidad, términos) NO se publican a producción sin revisión (M3, checklist propio del draft).
5. Idioma: español internacional profesional (la misma voz editorial de la landing y runbooks).

## Estado de esta documentación

| Grupo | Estado | Alineado con hito |
|---|---|---|
| specs/ | ✅ v2.2 (consolidación IA free-tier 2026-11-08) | base |
| adr/ | ✅ 13 ADRs (0001–0013) | M0, M3.5 |
| contracts/ | ✅ v1 congelados (schemas + ejemplos) | M0 |
| diagrams/ | ✅ 11 fuentes creados | M0–M5 |
| runbooks/ | ✅ 8 escritos (a verificar contra instalación real en M5) | M1–M5 |
| testing/ | ✅ 4 verificados (ejecutables a medida del repo) | M0–M5 |
| ux/ | ✅ 4 (tokens de marca: valores definidos en la extracción M3) | M3 |
| legal/ | ✅ 5 (2 drafts pendientes de revisión legal antes de M3) | M3 |
| release/ | ✅ 4 | M2–M5 |
