# Inventario funcional y plan de pruebas — SC-Sentinel

Fecha: 2026-11-21 · Fase D (N0, solo lectura) · Auditor: agente EGM
Estado: **borrador vivo**; se amplía en Fases 2–4.

Leyenda de columnas:
- **Dato real**: qué alimenta la función en producción.
- **Admin**: ¿requiere sesión de administrador?
- **Prueba**: cómo se verifica dentro del presupuesto de la sección B.

---

## 1. Páginas públicas (marketing / legal)

| Ruta | Archivo | API | Tabla / consulta de origen | Dato real | Admin | Prueba |
|---|---|---|---|---|---|---|
| `/` | `web/app/(marketing)/page.tsx` | — | — (estático/SSG) | Ninguno | No | GET + consola + enlaces |
| `/funcionalidades` | `web/app/(marketing)/funcionalidades/page.tsx` | — | — | Ninguno | No | GET + axe |
| `/security` | `web/app/(marketing)/security/page.tsx` | — | — | Ninguno | No | GET + axe |
| `/contacto` | `web/app/(marketing)/contacto/page.tsx` | — | — | Ninguno (formulario informativo) | No | GET + foco/teclado |
| `/novedades` | `web/app/(marketing)/novedades/page.tsx` | — | — | Ninguno | No | GET |
| `/legal/terms` | `web/app/(marketing)/legal/terms/page.tsx` | — | — | Ninguno | No | GET |
| `/legal/privacy` | `web/app/(marketing)/legal/privacy/page.tsx` | — | — | Ninguno | No | GET |
| `/legal/third-party-notices` | `web/app/(marketing)/legal/third-party-notices/page.tsx` | — | — | Ninguno | No | GET |
| `/login` | `web/app/login/page.tsx` + `LoginForm.tsx` | `POST /api/auth/login`, `POST /api/auth/guest-login` | `operators` (email, password_hash), `devices` | Credenciales admin / device demo | No (público) | Form + rate limit |
| `/p/[token]` (Trust Page) | `web/app/p/[token]/page.tsx` | `web/lib/trust/queries.ts` | `trust_pages`, `flow_windows`, `host_stats`, `alerts` | Datos agregados del device | No (token en URL) | Ver Fase 2 §2 |

## 2. Demo / visitante

| Ruta | Archivo | API | Tabla / consulta | Dato real | Admin | Prueba |
|---|---|---|---|---|---|---|
| `GET /demo` | `web/app/demo/route.ts:28` | — | `resolveGuestDevice()` → device sintético | Crea cookie `sc_guest` (1 h) | No | GET + rate limit `checkGuestDemoLimit` |
| Dashboard como visitante | `web/middleware.ts:55-61` | `/api/query` | Dataset **sintético** (`web/lib/demo/synthetic.ts`) cuando `isSyntheticDemoDevice` | Ninguno real (en memoria) | No | Aislamiento: `device_id` ajeno → 403 (`api/query/route.ts:108-113`) |
| `/dashboard/settings` como visitante | `web/middleware.ts:57-59` | — | — | — | — | Debe redirigir a `/dashboard/overview` |

## 3. Dashboard (vistas)

| Vista | Ruta | Componente | API | Tabla / consulta de origen | Agregación | Admin |
|---|---|---|---|---|---|---|
| Resumen (Overview) | `/dashboard/overview` | `OverviewView.tsx` | `GET /api/query?metric=overview\|alerts\|health` | `flow_windows`, `host_stats`, `asn_stats`, `alerts` — `web/lib/query/overview.ts:228` | `SUM(bytes_in/out)`, `COUNT(DISTINCT host_key)`, `COUNT(DISTINCT country) FILTER (<> 'LAN')`, `date_bin` para la serie, `MAX(hosts)` por ASN, `DISTINCT ON host_key` para riesgo | No (visitante puede) |
| Tráfico | `/dashboard` → TrafficPanel | `TrafficPanel.tsx`, `traffic/*` | `metric=overview`, `metric=heatmap` | `overview.ts` serie + `snapshot_json->'top_ports'` (`overview.ts:367-380`), `heatmap.ts` | `SUM` sobre `jsonb_array_elements` | No |
| Conexiones / Geo / ASN | `/dashboard/connections` | `ConnectionsView.tsx` | `metric=overview` | `top_countries` desde `host_stats` (`overview.ts:314-328`), `top_asns` desde `asn_stats` (`overview.ts:332-345`) | `SUM(bytes)`, `COUNT(DISTINCT host_key)`; ASN: `MAX(hosts)` (no suma) | No |
| Drill-down por host | `/dashboard/hosts` | `HostDrillDown.tsx`, `hosts/page.tsx` | `metric=hosts`, `metric=host&host_key=` | `web/lib/query/hosts.ts`, `host-detail.ts` | por ventana | No |
| Alertas | `/dashboard/alerts` | `AlertsView.tsx` | `metric=alerts`; `GET/PATCH /api/alerts/[id]`; `GET /api/operators` | `alerts`, `alert_notes`, `alert_audit_log` | `COUNT` por severidad (`overview.ts:356-365`) | Escritura (ack/reopen) → **solo admin** |
| Dispositivos / Ajustes | `/dashboard/settings` | `SettingsView.tsx` | `GET/POST /api/devices`, `/api/devices/enroll`, `/api/devices/[id]`, `/rotate`, `/api/trust`, `/api/trust/[id]/rotate` | `devices`, `trust_pages` | — | **Solo admin** (visitante redirigido) |
| Evaluaciones IA | `/dashboard/evals` | `EvalsView.tsx` | `metric=evals` (403 si no admin, `api/query/route.ts:186-193`) | `ai_insights` (`web/lib/query/evals.ts`) | `SUM(cost_usd)`, conteos | **Solo admin** |
| Insights IA | tarjeta en Overview | `AiInsightCard.tsx` | `metric=ai`, `POST /api/ai/analyze` | `ai_insights` (`fetchLatestInsight`) | último por device+idioma | No (lectura); analyze → admin |
| Exportaciones | `ExportBar.tsx` | `GET /api/export`, `/api/export/stats` | `web/lib/query/export.ts`, `export_logs` | streaming CSV/XLSX | Admin en stats; export según rol |
| Trust Access (admin) | `/dashboard/admin/trust-access` | `AdminTrustAccessView.tsx` | `GET /api/trust/access` | `trust_page_access_logs` | conteos | **Solo admin** |
| Exports (admin) | `/dashboard/admin/exports` | `AdminExportsView.tsx` | `GET /api/export/stats` | `export_logs` | SUM/COUNT | **Solo admin** |

## 4. APIs

| Endpoint | Método | Auth | Tabla | Nota |
|---|---|---|---|---|
| `/api/query` | GET | admin o guest | múltiples | `web/app/api/query/route.ts:63` |
| `/api/ingest` | POST | device token | `ingest_batches`, `flow_windows`, `host_stats`, `asn_stats`, `alerts` | **PROHIBIDO en producción** |
| `/api/chat` | POST | admin/guest | `chat_conversations`, `chat_messages` + RAG | SSE, presupuesto IA |
| `/api/chat/history` | GET/DELETE | admin/guest | `chat_*` | |
| `/api/alerts/[id]` | GET/PATCH | admin | `alerts`, `alert_audit_log` | ciclo de vida |
| `/api/devices*` | GET/POST/PATCH | admin | `devices` | enroll/rotate → **PROHIBIDO** |
| `/api/trust*` | GET/POST/DELETE | admin | `trust_pages`, `trust_page_access_logs` | rotate → **PROHIBIDO** |
| `/api/export`, `/api/export/stats` | GET | admin/guest | `export_logs` | |
| `/api/ai/cron` | POST | `CRON_SECRET` | `ai_insights` | **no ejecutar** |
| `/api/ai/analyze` | POST | admin | `ai_insights` | invoca IA |
| `/api/cron/cleanup` | POST | `CRON_SECRET` | retención | **no ejecutar** |
| `/api/csp-report` | POST | público (rate-limited) | log | CSP Report-Only |
| `/api/auth/login`, `/guest-login`, `/logout` | POST | público | `operators`, `devices` | |
| `/api/operators` | GET/POST | admin | `operators` | |

## 5. Plan de pruebas (resumen por fase)

- **Fase 2 (E)**: navegador sobre públicas + demo (link checker, consola, CSP, red), `curl -sSI` de cabeceras, 401/403 sin sesión, dashboard con sesión del propietario a 1440/390 px, axe-core + Lighthouse (1 corrida × 3 páginas), gates locales (`pnpm typecheck/lint/test/build`, `cargo fmt/clippy/test`, `pnpm audit`).
- **Fase 3 (F)**: `/status` del agente → SQL (≤3 ejecuciones) → `/api/query` admin → DOM/SVG con Playwright; tabla métrica × nivel.
- **Fase 4 (G)**: `gh run list`, conteos de `ai_insights`, 12–15 preguntas al chatbot con ground truth SQL (≤20 llamadas), lectura del contexto enviado al proveedor, `sc-detect`.
- **Fase 5 (H)**: inventario de archivos del agente, diseño del instalador con `egm-brainstorm`/`egm-draft`/`egm-review`.
- **Fase 6 (K)**: registro único de baches + plan por olas.
