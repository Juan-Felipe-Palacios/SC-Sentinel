# Arquitectura — C4 (Context → Containers → Components)

**Fuente de verdad:** `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` §3, §17.
**Diagrams as code:** los bloques Mermaid viven en `docs/diagrams/mermaid/` y se renderizan en GitHub/Notion/Obsidian.

## Level 1 — Contexto del sistema

`docs/diagrams/mermaid/system-context.mmd` (existente). Actores: Administrador, SOC Analyst, Visitante (demo), Router/Switch. Sistemas externos: Vercel (landing/dashboard/API), Neon Postgres, cadena IA (Gemini → OpenRouter → Groq). El agente corre en el nodo del cliente y envía **solo señales agregadas**, nunca paquetes crudos (ADR-0005).

## Level 2 — Contenedores

`docs/diagrams/mermaid/c4-containers.mmd`. Contenedores principales:

| Contenedor | Tecnología | Responsabilidad |
|---|---|---|
| sc-agent | Rust (binario firmado) | captura (pcap/Npcap o colector IPFIX), agregación 30–60 s, detección determinista, spool SQLite, sync HTTPS |
| SQLite Spool | SQLite local | cola FIFO de batches pendientes, drenaje ~60 req/min (ADR-0011) |
| Landing | Next.js 15 (SSG) | marketing, legales, SEO |
| Dashboard | Next.js 15 (SSR/SWR) | overview, hosts, conexiones, alertas, settings, admin |
| /api/ingest | Route handler Node | auth por token SHA-256, descompresión, validación zod, upsert Neon |
| /api/query | Route handler Node | métricas agregadas por device y rango |
| /api/ai/cron | Route handler Node | gate 15 min + dedup facts_hash, cadena multi-proveedor |
| Neon Postgres | Postgres serverless | flow_windows, alerts, agent_health, ai_insights, devices, settings |
| IA providers | Gemini → OpenRouter → Groq | interpretación por lotes (nunca fuente de verdad) |

## Level 3 — Componentes del agente

`docs/diagrams/mermaid/agent-components.mmd`. Crates: `sc-config`, `sc-core`, `sc-capture`, `sc-collector`, `sc-geo`, `sc-detect`, `sc-aggregate`, `sc-sync`, `sc-telemetry`. Canales: `FlowUpdate` (capture/collector → aggregate), `WindowSnapshot` (aggregate → detect → sync), `Alerts` (detect → aggregate).

## Niveles de zoom y cuándo usar cada uno

- **Contexto (L1):** onboarding, stakeholders, pitch.
- **Contenedores (L2):** decisiones de despliegue, límites de confianza, protocolos.
- **Componentes (L3):** trabajo en un crate, PRs del agente.
- **Código (L4):** solo bajo demanda (rustdoc / TypeScript types); no se mantiene como diagrama estático.

## Reglas de actualización

Si un PR cambia contenedores o protocolos, actualizar el `.mmd` correspondiente en el mismo PR (regla 1 de `docs/README.md`). Los `.svg`/`.pdf` de `docs/diagrams/exports/` se generan bajo demanda y no se versionan.