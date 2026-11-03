# ADR-0003 — Neon Postgres free tier como base de datos

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §2, §6, §12

## Contexto

Vercel serverless (routes `/api/ingest`, `/api/query`, crons) necesita una DB externa. Requisitos: free tier, sin estado en serverless, tolerancia a semanas del agente offline, branching para previews.

## Decisión

**Neon Postgres free tier** con acceso vía driver HTTP serverless + Drizzle ORM.

- Autosuspend no destruye datos; cold start ~1 s es tolerable (el agente reintenta, spec §8.1).
- Branching nativo para preview deployments de Vercel.
- Capacidad 0,5 GB macro-suficiente: sizing proyectado ~22 MB/día + 50% overhead ≈ ~250 MB total con retención estricta (spec §12.2).
- Política de retención (§12.1) + cron de cleanup diario 03:00 UTC (§12.4); alerta si la DB supera 400 MB.
- Sin raw packets ni flujos individuales: solo snapshots agregados JSONB.

## Alternativas consideradas

- **Supabase free**: buen fit (Postgres + realtime), pero realtime no se usa (SWR) y el driver serverless de Neon es nativo de Vercel + branching de previews es más directo. Descartado.
- **MongoDB Atlas / Redis free**: modelo documental/relacional sin JSONB indexado apropiado ni Postgres hooks; descartado.
- **TimescaleDB / ClickHouse**: reevaluar si el volumen crece (escalares MCP, no v1).

## Consecuencias

- Estricto control de cardinalidad y limpieza agresiva obligatorios; si se rompe el sizing, reevaluar motor (spec §2).
- `flow_windows` duplica datos en `snapshot_json` + tablas derivadas (`alerts`, `agent_health`): redundancia intencional para velocidad de query (spec §6.1 nota).
