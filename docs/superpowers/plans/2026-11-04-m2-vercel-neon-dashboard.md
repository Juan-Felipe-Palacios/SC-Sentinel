# M2 — Vercel API + Neon + Dashboard v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Fecha:** 2026-11-04  
**Hito:** M2  
**Duración estimada:** 1.5 semanas  
**Fuente de verdad:** `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` (Secciones 2, 5, 6, 9, 12, 14, 18) + `docs/contracts/*.schema.json`

## Objetivo del Hito
Desplegar la infraestructura de nube (Neon Postgres + Vercel API) y el Dashboard v0 para recibir, validar, almacenar y visualizar los datos agregados enviados por el agente Rust (completado en M1).

## Criterios de Éxito (Definition of Done)
- [ ] `/api/ingest` valida payloads con Zod, autentica device-token (Bearer + SHA-256 en DB) y realiza inserts idempotentes.
- [ ] Rate limit básico activo en `/api/ingest`.
- [ ] `/api/query` expone datos agregados para el dashboard.
- [ ] Dashboard v0 (Overview) muestra datos reales con polling SWR de 5s.
- [ ] Job de cleanup de base de datos configurado (política de retención).
- [ ] Health del agente visible en el dashboard.
- [ ] Smoke test E2E: Agente real (o fixture) → Vercel Preview → Neon → Dashboard mostrando datos.

---

## Task 1: Neon Postgres + Drizzle ORM Setup
**Files:**
- Create: `web/drizzle.config.ts`, `web/lib/db/index.ts`, `web/lib/db/schema.ts`, `web/lib/db/migrate.ts`
- Modify: `web/package.json`
- Create: `web/.env.example`

**Esquema:**
- `devices` (id, token_hash sha256 UNIQUE, name, enrolled_at, last_seen_at, status)
- `ingest_batches` (id, device_id FK, window_id, payload_hash, received_at, status) - UNIQUE(device_id, window_id)
- `flow_windows` (id, batch_id FK, device_id FK, window_id, start_at, end_at, sequence, snapshot_json JSONB)
- `host_stats` (id, window_id FK, host_key, bytes_in, bytes_out, packets, country, risk_score)
- `alerts` (id, window_id FK, rule_id, severity, title, description, evidence JSONB)
- `agent_health` (id, device_id FK, capture_status, packets_seen, packets_dropped, parse_errors, queue_depth, spool_bytes, last_error, recorded_at)

**Steps:**
- [ ] **Step 1:** Crear proyecto Neon Postgres (free tier) y obtener `DATABASE_URL`
- [ ] **Step 2:** Instalar dependencias: `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`, `zod`
- [ ] **Step 3:** Configurar `drizzle.config.ts` y crear esquema Drizzle completo
- [ ] **Step 4:** Generar migración con `drizzle-kit generate`
- [ ] **Step 5:** Aplicar migración con `drizzle-kit push` o script
- [ ] **Step 6:** Crear conexión helper con Neon serverless
- [ ] **Step 7:** Commit `feat(web): setup Neon + Drizzle ORM con esquema completo para M2`

---

## Task 2: API `/api/ingest` (Validación, Auth, Idempotencia, Rate Limit)
**Files:**
- Create: `web/app/api/ingest/route.ts`
- Create: `web/lib/schemas/ingest.ts` (Zod - espejo de contratos)
- Create: `web/lib/auth/device.ts`
- Create: `web/lib/rate-limit/ingest.ts`

**Requisitos:**
- Validación con Zod exacta a `IngestEnvelope` v1
- Auth Bearer + SHA-256 contra `devices.token_hash`
- Idempotente con `ON CONFLICT (device_id, window_id) DO NOTHING` → 200 `{status:"duplicate"}`
- Rate limit básico (10 req/min por device_id o por IP)
- Soportar body gzip
- Códigos: 200 processed/duplicate, 400 invalid_contract, 401 unauthorized, 403 forbidden, 413 too_large, 429 rate_limited

**Steps:**
- [ ] **Step 1:** Crear schema Zod basado en `docs/contracts/ingest-request.valid.json`
- [ ] **Step 2:** Implementar verificación de token SHA-256
- [ ] **Step 3:** Implementar rate limiting
- [ ] **Step 4:** Implementar handler con validación, auth, idempotencia, inserción transaccional
- [ ] **Step 5:** Tests con vitest (token válido/inválido, payload inválido, duplicate)
- [ ] **Step 6:** Commit `feat(api): /api/ingest con Zod, auth Bearer SHA-256, idempotencia y rate limit`

---

## Task 3: API `/api/query` (Endpoints para Dashboard)
**Files:**
- Create: `web/app/api/query/route.ts` o rutas específicas
- Create: `web/lib/query/overview.ts`, `web/lib/query/hosts.ts`, `web/lib/query/alerts.ts`, `web/lib/query/health.ts`

**Endpoints:**
- `GET /api/query?metric=overview&range=1h` - bytes in/out, top hosts summary, windows count
- `GET /api/query?metric=alerts&range=24h` - últimas alertas
- `GET /api/query?metric=health` - último agent_health por device
- `GET /api/query?metric=hosts&range=1h` - top hosts detallado

**Steps:**
- [ ] **Step 1:** Implementar queries SQL con Drizzle
- [ ] **Step 2:** Proteger con auth de admin (cookie)
- [ ] **Step 3:** Añadir validación de parámetros
- [ ] **Step 4:** Tests de integración
- [ ] **Step 5:** Commit `feat(api): /api/query con métricas para dashboard`

---

## Task 4: Dashboard v0 (Layout, Auth, Overview con SWR)
**Files:**
- Create: `web/app/(dashboard)/layout.tsx`, `web/app/(dashboard)/dashboard/overview/page.tsx`
- Create: `web/app/login/page.tsx`, `web/app/api/auth/login/route.ts`
- Create: `web/middleware.ts`
- Create: `web/components/dashboard/*`, `web/components/ui/*` (usar shadcn/ui)
- Modify: `web/package.json` (swr, recharts, jose/iron-session)

**Requisitos:**
- Auth admin con cookie httpOnly `sc_session` (jose o iron-session)
- Middleware protegiendo `/dashboard/*`
- Layout con Sidebar, Topbar
- Overview con SWR polling cada 5s
- Componentes: StatCard, TrafficChart (Recharts), TopHostsTable
- Indicador de health del agente (online/offline, last_seen, drops)

**Steps:**
- [ ] **Step 1:** Instalar dependencias UI (swr, recharts, shadcn/ui si no instalado)
- [ ] **Step 2:** Implementar auth login/logout
- [ ] **Step 3:** Crear middleware y layout protegido
- [ ] **Step 4:** Implementar página Overview con SWR
- [ ] **Step 5:** Añadir componentes de visualización
- [ ] **Step 6:** Mostrar health del agente en UI
- [ ] **Step 7:** Commit `feat(dashboard): v0 Overview con SWR polling 5s, auth admin y health visible`

---

## Task 5: Database Cleanup (Política de Retención)
**Files:**
- Create: `web/app/api/cron/cleanup/route.ts`
- Create: `web/lib/cleanup/retention.ts`
- Create: `web/vercel.json`

**Política (basada en spec):**
- `flow_windows` / `host_stats` / `alerts`: 7 días
- `ingest_batches`: 30 días (o mantener según necesidad)
- `agent_health`: 7 días
- Ejecutar diario a las 03:00 UTC vía Vercel Cron

**Steps:**
- [ ] **Step 1:** Implementar función de cleanup con transacciones
- [ ] **Step 2:** Crear endpoint `/api/cron/cleanup` con verificación de header de Vercel Cron
- [ ] **Step 3:** Configurar `vercel.json`
- [ ] **Step 4:** Test manual
- [ ] **Step 5:** Commit `feat(cron): cleanup automático con política de retención`

---

## Task 6: Verificación Final M2 (Smoke Test E2E)
**Checklist:**
- [ ] **Step 1:** Variables de entorno configuradas en Vercel (DATABASE_URL, ADMIN_SECRET, etc.)
- [ ] **Step 2:** Migraciones aplicadas a Neon
- [ ] **Step 3:** Deploy a Vercel Preview
- [ ] **Step 4:** Configurar device en DB con token hash
- [ ] **Step 5:** Ejecutar sc-agent apuntando a preview URL con token válido
- [ ] **Step 6:** Verificar logs Vercel: 200 OK en /api/ingest
- [ ] **Step 7:** Verificar datos en Neon y dashboard
- [ ] **Step 8:** Tests: `pnpm lint && pnpm typecheck && pnpm test` OK
- [ ] **Step 9:** Commit cierre `chore(m2): milestone M2 completo - Vercel API + Neon + Dashboard v0`

---

## Notas y Dependencias
- **Root Directory Vercel:** Configurar en `web/`
- **Seguridad:** Solo guardar SHA-256 de tokens, nunca plaintext
- **Idempotencia:** Crítica - usar UNIQUE constraint
- **UI:** shadcn/ui + Tailwind CSS
- **Auth:** Cookie httpOnly, secure en producción
- **Rate limiting:** Implementación simple inicial, puede migrar a Upstash después
- **Dependencia M1:** Agente ya soporta endpoint configurable ✓
