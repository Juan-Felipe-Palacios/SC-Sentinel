# M3 — Landing pública + IA asistente (design + implementación)

**Fecha:** 2026-11-05 · **Estado:** plan aprobado por el usuario (luz verde) · **Doc fuente:** este archivo manda sobre cualquier borrador interno
**Spec:** `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` (v2.1; nota: algunas notas internas apuntan a `docs/specs/…` — ruta incorrecta, usar siempre la indicada aquí)

---

## 1. Contexto y decisiones consolidadas

### 1.1 Lo que dijo el usuario (verbatim)
- «Una vez commiteado, arrancamos directamente con la Task 1 (Configurar Tailwind v4 @theme y el scaffold de la landing pública).»
- Luz verde para: escribir este plan → commit del plan (`docs(plan): add M3 implementation plan`) → arrancar con Task 1.

### 1.2 Decisiones adoptadas (el usuario puede vetar cualquiera)
| # | Tema | Decisión | Razón |
|---|---|---|---|
| D1 | Scheduler IA | Cron externo tipo cron-job.org → `POST /api/ai/cron` con `x-cron-secret` (Plan B §5.4). **Nunca** agregar `*/5 * * * *` a `web/vercel.json` | Vercel Hobby no garantiza 5-min crons; previews no disparan crons |
| D2 | Analytics | Vercel Web Analytics por defecto; decisión final en la task de SEO | Mínima fricción, sin tracking invasivo (landing-sitemap.md) |
| D3 | `OPENROUTER_API_KEY` | Solo en Vercel Preview/Prod; nunca en el repo; IA degrada elegantemente si falta | ADR-0005: degradación obligatoria |
| D4 | IDs de modelo | Env `AI_MODELS` (coma-separada); defaults `:free` en código | Evitar hardcodear modelos perecederos |
| D5 | Fallback chain | modelo 1 → modelo 2 → modelo 3 → determinista; `AbortSignal.timeout(30_000)`; parse zod del JSON; sin logs con payload | §11.3 |
| D6 | Dedup `facts_hash` | sha256 del JSON canónico de facts (orden fijo de claves) + `UNIQUE INDEX idx_ai_insights_facts_hash`? — **no**: §6.1 define index `(device_id, created_at DESC)`; dedup se resuelve por consulta (`SELECT … WHERE facts_hash = … LIMIT 1`) en el mismo cron; si existe insight para ese hash y <5 min, reusar. Sin unique index nuevo | Sigue spec; evita pelear con rows duplicados históricos |
| D7 | Retention `ai_insights` | 15 días, sumado a `runRetentionCleanup` + test; runbook actualizado (hoy dice 7 d — desactualizado vs §12.1/§12.4) | spec gana sobre runbook |
| D8 | Dashboard IA | SWR con `refreshInterval: 30_000` para el panel IA (overview mantiene ADR-0004 5 s); estado `degraded` se muestra como tal, sin datos inventados | ADR-0005 |
| D9 | `/api/ai/analyze` | Reusa `verifyAdminAuth` (cookie `sc_session` o tooling secret); si el último insight tiene <5 min → `200 { cached: true, insight }`; si cadena agotada → `200 { status: "degraded" }`; misma pipeline que el cron | §5.3 |
| D10 | `/ai/analyze` métrica en `/api/query` | `metric=ai` implementada en `/api/query` reusando `resolveDeviceId`; devuelve último insight (summary, status, created_at, facts_hash timing) | §5.2 metric enum `ai` |
| D11 | Skeleton `app/page.tsx` | **Eliminar** `web/app/page.tsx` (skeleton M0) — `app/(marketing)/page.tsx` resolvería la ruta `/` y habría conflicto | Next.js App Router |
| D12 | Legales | Drafts `docs/legal/*` adaptados con gatillo **sign-off** del usuario antes de publicar `/legal/*` — nunca sin aprobación | Documentos legales no son texto de producto |
| D13 | Contacto | Formulario RHF + Zod → `POST /api/contact` (valida, loguea, `{ ok: true }`). Sin persistencia ni envío real en M3; provider de email = tarea aparte con decisión del usuario | Ninguna fuente aprobó infra de email para M3 |
| D14 | SSG sin DB | Landing/legal/security/funcionalidades: estáticos, sin tocar Neon, sin cookies | Render estático; deploy Preview-first |
| D15 | Naming del plan | `2026-11-05-m3-landing-ia-design.md` (fecha de hoy) | Instrucción del usuario |
| D16 | Commit por tarea | 1 commit por task (mensaje `feat(marketing): …`, `feat(ai): …`, etc.) + commit del plan con `docs(plan): add M3 implementation plan` | Estilo M2 |

### 1.3 Alcance M3 (definición según spec §14.3 / §18.1)

**Incluido**
1. Landing pública SSG: `/`, `/funcionalidades`, `/security`, `/contacto`, `/legal/privacy`, `/legal/terms`, `/legal/third-party-notices`.
2. Tokens de diseño Tailwind v4 `@theme` (extender, no recrear) + scaffold del grupo `(marketing)`.
3. IA asistente por lotes: tabla `ai_insights` (migración nueva, preview-only), `/api/ai/analyze`, `/api/ai/cron`, fallback determinista, dedup por `facts_hash`, retention 15 d.
4. Dashboard: panel IA (insights vía `/api/query?metric=ai`), estado degraded visible.
5. SEO básico: `robots.txt`, `sitemap.xml`, OpenGraph/metadata por ruta, analytics activado.
6. Legal: privacy / terms / third-party notices publicados con sign-off.

**Fuera de alcance (v1.1+)**
- `/pricing`, `/docs` (spec §18.1: en v1 CTA «Contactar ventas»).
- Panel multi-device, IA owner-facing, SSO → ADRs de iteración posterior.
- Fix del `confirm()` incondicional del agente (bug real conocido; decisión separada del usuario).
- Persistencia/envío real del formulario de contacto (requiere provider).

---

## 2. Hallazgos del spec v2.1 que este plan respeta (audit trail)

- **§5.2** metric enum de `/api/query` incluye `ai` → D10.
- **§5.3** `/api/ai/analyze`: POST, cookie `sc_session`; <5 min desde último análisis → `200 { cached: true }`; cadena agotada → `200 { status: "degraded" }`; misma pipeline que cron.
- **§5.4** `/api/ai/cron`: **POST** con header `x-cron-secret: CRON_SECRET`; plan B = cron externo cada ~5 min; `/api/cron/cleanup` diario 03:00 UTC se mantiene.
- **§6.1** `ai_insights`: `id TEXT PK`, `device_id TEXT NOT NULL REFERENCES devices(id)`, `period_start/period_end TIMESTAMPTZ NOT NULL`, `model TEXT NOT NULL`, `status TEXT NOT NULL` (`ok|degraded`), `summary TEXT NOT NULL`, `recommendations_json JSONB NOT NULL`, `facts_hash TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`; índice `(device_id, created_at DESC)`; **retention 15 días** (§11.4).
- **§11.1** input = SOLO facts agregados: period, total_bytes, total_packets, top_hosts[], top_ports[], top_countries[], alerts[], health{}. NUNCA paquetes crudos, contenido de tráfico, IPs sin anonimizar.
- **§11.2** output = `{ summary, risk_level, findings: [{ type, description, severity }], recommendations: [...] }` → guardado como `recommendations_json`.
- **§11.3** cadencia ~5 min; timeout 30 s; chain 1→2→3→determinista; sin colas; prompt ≤ 4 000 tok; respuesta ≤ 1 000 tok.
- **§12.1/§12.4** cleanup 03:00 UTC; retention `ai_insights` = 15 d.
- **§14.3** M3 acceptance: landing publicada; tokens aplicados; panel IA con insights; **fallback/degraded probado**; legal/privacy publicados; SEO básico; analytics activo.
- **§16.1** stack: Next 15 App Router, Tailwind v4 CSS-first (sin `tailwind.config.js`), Drizzle+Neon, jose, SWR, RHF+Zod. shadcn/ui no instalado — el proyecto usa componentes mínimos propios (mantener).
- **§18.1** rutas M3 incluyen **`/security`** (omitida en borrador previo). Secciones Home: Hero, Problema, Solución, Cómo funciona, Arquitectura resumida, Privacidad, CTA secundario, Footer legal.
- **ADR-0005** batch-only AI, ≤ 1 llamada / 5 min, degraded fallback obligatorio. **ADR-0012** dominio oficial `sc-sentinel.vercel.app`. **ADR-0003** Neon free, preview branches; **ADR-0004** SWR 5 s (excepción panel IA → 30 s, D8). **ADR-0007** single device v1.
- **Copy** (`docs/ux/copywriting.md`): H1 «Ve lo que pasa en tu red. Sin enviar paquetes crudos a la nube.»; CTA principal «Contactar»; 3 pasos; cards con encabezados dados; página `/security` con bullets dados; copy dashboard estados dados; prohibidas promesas absolutas («100% seguro», «impenetrable»).
- **Landing sitemap** (`docs/ux/landing-sitemap.md`): SSG grupo `(marketing)`; mensaje clave «Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos.»; `sitemap.xml` + `robots.txt` públicos; OG images `public/og/`; footer dominio corporativo.
- **Legal**: `docs/legal/` contiene drafts con leyenda «no publicar sin revisión legal» → gate D12.

---

## 3. Estado del repo relevante (verificado 2026-11-04/05)

- `web/globals.css`: `@theme` con tokens sc-* fijos de M2 (bg #0b1220, surface #111827, surface-alt #1f2937, text #e5e7eb, text-muted #94a3b8, ok, warn, degraded, risk-*, viz-in #38bdf8, viz-out #a78bfa, font-display, font-mono, .sc-hairline). **Extender, no recrear.**
- `web/app/layout.tsx`: lang="es", fonts `--font-space-grotesk`/`--font-plex-mono`, metadata «SC-Sentinel».
- **Conflicto pendiente**: `web/app/page.tsx` (skeleton M0) y `(marketing)/page.tsx` ocuparían `/` → eliminar el primero (D11).
- `(marketing)/` y `components/{marketing,ui}` solo READMEs; `public/og/` solo README; `next.config.ts` vacío; `vercel.json` solo `/api/cron/cleanup`; `web/.env.example` **sin** `OPENROUTER_API_KEY` ni `AI_MODELS`; schema = 6 tablas, **sin** `ai_insights`; migración `0000_init.sql` (única); runbook retention dice 7 d para AI (desactualizado); `/api/ai/*` no existe.
- M2 cerrado: commits hasta `3fe3a24`; gates verdes; Neon branch preview `m2-preview` permanente; production intacta; deployment protection (SSO) desactivada project-wide; Preview actual: `https://sc-sentinel-ar4sms4yr-strategicconnex.vercel.app`; cron `0 3 * * *` solo en Production.
- Neon: proyecto `dawn-salad-70652393`, branch `m2-preview` `br-misty-king-bds23pof`; **nunca tocar `[default] production`**; migrations solo con autorización y solo a preview.
- Archivos user-owned sin tocar jamás: `agent/.gitignore`, `agent/Cargo.lock`, `agent/README.md`.
- `agent/crates/sc-agent/src/main.rs` modificado por el usuario (patch `--device-id`, commit `00868e6`); el resto de `agent/*` intacto.
- Working tree al iniciar: limpio salvo archivos user-owned.

## 4. Principio de diseño (brief del usuario + resumen)

- DNA de marca confirmado: tokens M2 (no se descartan), estética **técnico-oscura con dispositivo «panel de rack»**; acento viz-in/out para datos.
- Restricciones: español internacional profesional (sin voseo en producto); sin claims absolutos; sin fear-marketing; mensaje clave §5; IA como enriquecimiento por lotes, degradable.
- Signature del landing: **strip de estado de captura** (punto pulsante + métricas de salud del motor) como firma visual compartida entre dashboard y landing (coherencia de sistema de diseño).
- Restraint: un acento brillante (viz-in), el resto quiet; tipografía Space Grotesk (display) + IBM Plex Mono (datos).

---

## 5. Plan de tareas

> Orden = dependencias. Cada task termina con gates web (`pnpm --dir web lint && typecheck && test && build`) + commit. Commits por tarea (D16).

### Task 1 — Tokens `@theme` + scaffold `(marketing)`
**Archivos:** `web/app/globals.css` (extender), `web/app/(marketing)/layout.tsx` (nuevo), `web/components/marketing/{MarketingShell.tsx? — decidir: nav mínimo propio + footer}.tsx`, `web/app/(marketing)/page.tsx` (placeholders mínimos SSG), **borrar** `web/app/page.tsx` (D11), `web/components/ui/` solo si hace falta un `Button`/`Badge` propio mínimo.
**Pasos:** revisar §16.1; extraer tokens a `@theme` con evidencia (síntesis del brief, no copiar assets de terceros); definir utilidades marketing (`.m-*` o tokens nuevos `sc-accent` etc. manteniendo M2); construir shell: Nav (logo SVG + links Funcionalidades/Seguridad/Contacto + CTA «Contactar»), Footer (links legales + dominio oficial + "Monitoring…" línea); home placeholder; `generateStaticParams` n/a.
**DoD:** build SSG OK; cero recursos externos en runtime; accesible (focus visible, contraste, lang=es); reduced-motion respetado; **commit** `feat(marketing): scaffold grupo (marketing) + tokens Tailwind v4`.

### Task 2 — Home `/` completa (copy real)
**Contenido:** Hero (H1, sub, CTA principal /contacto, CTA secundario /funcionalidades), Problema, Solución (cards del copy), Cómo funciona (3 pasos), Arquitectura resumida (mini-diagrama SVG propio del pipeline agente→agregación→dashboard; sin assets ajenos), Privacidad, CTA secundario, Footer. Mensaje clave §5 visible.
**Pasos:** todo como Server Components estáticos; imágenes solo propias/SVG; metadata OG (placeholder imagen `public/og/landing.png` — generar en Task 7).
**DoD:** mismos gates; SSG; sin fetch en runtime; **commit** `feat(marketing): landing home con copy v1`.

### Task 3 — `/funcionalidades`
**Contenido:** features detalladas según tabla de copy (motor determinista, señales agregadas, alertas con evidencia, IA asistente, offline-friendly, infraestructura liviana) + diagrama pipeline extendido; CTA «Contactar».
**DoD:** gates + SSG; **commit** `feat(marketing): página funcionalidades`.

### Task 4 — `/security`
**Contenido:** titular «La seguridad empieza por la nuestra.» + bullets (token rotante, secretos solo servidor, logs sin datos sensibles, retención con limpieza diaria, cookie firmada) + sección «Lo que NO hacemos» (no paquetes crudos a nube; no IPs sin anonimización con modo activado).
**DoD:** gates + SSG; **commit** `feat(marketing): página security`.

### Task 5 — `/contacto` + `/api/contact`
**Contenido:** form RHF + Zod (nombre ≤120, email válido, mensaje ≤5 000, honeypot `company` oculto); Server Action o route `POST /api/contact`: valida, sanitiza, log estructurado `{event:'contact_request',…}` **sin** datos sensibles en log, responde `{ ok: true, message: '…≤1 día hábil…' }`; errores de campo en español.
**DoD:** gates; contrato zod unit-test (`lib/contact/schema.test.ts`); **sin** provider de email; **commit** `feat(marketing): página contacto + endpoint de formulario (sin envío real)`.

### Task 6 — Legales `/legal/privacy`, `/legal/terms`, `/legal/third-party-notices`
**Fuente:** `docs/legal/privacy-policy-draft.md`, `terms-draft.md`, `THIRD_PARTY_NOTICES.md` → textos pulidos (español int.), páginas SSG estáticas, metadata `robots: index,follow`, footer legal común.
**Gate D12:** antes de commit, texto final se muestra al usuario para **sign-off explícito**; sin sign-off la task queda marcada bloqueada y las páginas no existen.
**DoD:** sign-off + gates; **commit** `feat(legal): privacy, terms y third-party notices (aprobados)`.

### Task 7 — SEO + Analytics + OG
**Pasos:** `web/app/sitemap.ts` (rutas públicas), `web/app/robots.ts` (allow /, disallow /dashboard, /api, /login), metadata por ruta con canonical `https://sc-sentinel.vercel.app` (ADR-0012); `public/og/landing.png` (imagen OG propia — SVG→PNG o generación; documentada como asset propio); **Vercel Web Analytics** (`@vercel/analytics` + `<Analytics/>` en root o marketing layout) solo si D2 confirmado; nota Web Analytics respeta DNT? (usar modo respetuoso); validar sitemap/robots con curl.
**DoD:** Lighthouse/audit básico sin errores críticos en SSG; gates; **commit** `feat(seo): sitemap, robots, canonical, OG y analytics`.

### Task 8 — Migración `ai_insights` + retention 15 d
**Pasos:** `web/lib/db/schema.ts` agregar `aiInsights` (§6.1 exacta, tipo `jsonb`, `index('ai_insights_device_time', …)` `(device_id, created_at)`); `pnpm --dir web exec drizzle-kit generate --name ai-insights`; **revisar** SQL generado (FK devices(id), sin unique extra, index); **aplicar SOLO a m2-preview** con autorización explícita del usuario (igual que M2) — nunca `[default] production`; `web/lib/cleanup/retention.ts`: `RETENTION_DAYS.aiInsights = 15`, nuevo borrado `ai_insights WHERE created_at < cutoff` ordenado último, test `retention.test.ts` actualizado; runbook `docs/runbooks/database-cleanup.md`: corregir 7 d → 15 d y agregar ai_insights.
**DoD:** gates (test incluye nuevo caso); migración aplicada a preview (si autorizada) y verificada con `SELECT count(*)`; **commit** `feat(db): migración ai_insights + retención 15 días`.

### Task 9 — `/api/ai/analyze` + `/api/ai/cron` + pipeline
**Lib `web/lib/ai/`:** `facts.ts` (agrega facts desde DB: period de la última ventana, totals, top_hosts, top_ports [de host_stats], top_countries, alerts 7d, health), `hash.ts` (JSON canónico ordenado → sha256), `openrouter.ts` (POST `https://openrouter.ai/api/v1/chat/completions`, header Authorization Bearer `OPENROUTER_API_KEY`, modelo de `AI_MODELS` coma-separado, `AbortSignal.timeout(30_000)`, respuesta vía zod `AiOutputSchema` §11.2, sin loggear payload), `analyze.ts` (pipeline: reúsa facts → hash → dedup (<5 min o mismo hash → devolver existente) → chain → persistir `ai_insights` → `{ status, insight }`), `index.ts`.
**Endpoints:** `POST /api/ai/analyze` (verifyAdminAuth; <5 min → `{cached:true, insight}`; chain agotada → `{status:"degraded"}`; error → 500 `{error}`); `POST /api/ai/cron` (runtime nodejs, maxDuration 60; auth `x-cron-secret` o Bearer vs `CRON_SECRET` con safeEqual; 404 en GET; llama `runAnalysisPipeline()`; log JSON `{event:'ai_cron', …}`).
**`/api/query`:** `metric=ai` → último insight del device (o `{}` vacío) — §5.2.
**Tests:** `lib/ai/__tests__/hash.test.ts`, `analyze.test.ts` con fetch mockeado (cadena, timeout simulado, degraded), `facts` sobre fixtures.
**DoD:** gates; **commit** `feat(ai): pipeline por lotes con fallback determinista y endpoints analyze/cron`.

### Task 10 — Dashboard: panel IA
**Pasos:** `/dashboard/overview`: nueva card «Análisis IA» (SWR `refreshInterval: 30_000` sobre `/api/query?metric=ai`): estado `ok` (summary mono, risk_level chip, timestamp), `degraded` (estado honesto, sin facts inventados), `sin datos` (copy «Aún no hay análisis. El motor determinista sigue activo.»); opcional página dedicada `/dashboard/ai` (decidir al implementar; no bloquear M3 si se posterga).
**DoD:** gates; pantallazo del estado degraded con /api mockeando 503; **commit** `feat(dashboard): panel IA con estado degraded honesto`.

### Task 11 — Cierre M3
**Pasos:** gates completos; E2E contra Preview (landing SSG 200; legal tras sign-off; `/api/ai/analyze` con y sin key → degraded/ok; cron con secreto → ok; dashboard IA visible); **commit** `feat(m3): landing pública + IA asistente — hito M3 completo`; update `mem:web/core`; reporte final con lista de pendientes (legal sign-off, analytics final, email provider, IA cron externo setup, rotación opt-in).

---

## 6. Riesgos y decisiones abiertas (el usuario decide)

1. **Legal sign-off (bloqueante Task 6)** — sin aprobación no se publican `/legal/*`.
2. **Analytics vendor** — default D2 Vercel Web Analytics; posible opt-out del usuario.
3. **`/api/contact` provider** — en M3 solo log; ¿Resend/SMTP/otro? (v1.1).
4. **`AI_MODELS`** — defaults `:free` son frágiles; confirmar modelos reales.
5. **Cron externo** — quién crea la tarea en cron-job.org y con qué URL (requiere Preview/Prod deployado) + CRON_SECRET.
6. **Budget OpenRouter** — costo real si se activan modelos pagos (out of scope M2/M3 free-tier).
7. **Plan Vercel** — si pasa a Pro, se podría usar Vercel cron para IA (no recomendado cambiar vercel.json de todos modos si Preview-first se mantiene).
8. **Sign-off textos privacy/terms** — D12.

## 7. Verificación y gates

- Por tarea: `pnpm --dir web lint && pnpm --dir web typecheck && pnpm --dir web test && pnpm --dir web build`.
- Contratos: sin cambios (ninguna sección de contrato cambia en M3).
- Migración Task 8: aplicar solo con autorización; verificar `\dt` y count.
- Preview E2E Task 11: smoke completo (§1.4 de M2 cerrado).
- Prohibido sin autorización: tocar `[default] production` Neon, `agent/*`, `.env*`, archivos user-owned.

## 8. Referencias rápidas

- Spec: `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md`
- ADR-0003/0004/0005/0007/0012 · `docs/ux/copywriting.md` · `docs/ux/landing-sitemap.md` · `docs/legal/*`
- `docs/runbooks/database-cleanup.md` (fix 15 d) · `docs/release/deployment.md` (nota: `SESSION_SECRET` en doc vs código `SC_SESSION_SECRET` — actualizar en Task 11)
- M2 cerrado: `3fe3a24` · Preview: `https://sc-sentinel-ar4sms4yr-strategicconnex.vercel.app` · cron `/api/cron/cleanup` prod-only · commit `00868e6` agent `--device-id`

---

## 9. Estado de ejecución — cierre M3 (2026-11-04)

| Task | Estado | Commit / evidencia |
|---|---|---|
| 1 · tokens + `(marketing)` | ✅ | `c625dc3` |
| 2 · Home | ✅ | `8888c32` |
| 3 · `/funcionalidades` | ✅ | `a540bea` |
| 4 · `/security` | ✅ | `173a2b6` |
| 5 · `/contacto` | ✅ (sin formulario: perfil de LinkedIn como canal único, ver §9.1) | `9662fe1` → canal LinkedIn |
| 6 · `/legal/*` | ✅ con sign-off | `ff46e27` |
| 7 · SEO + Analytics + OG | ✅ | `af1c0fb` (`sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `@vercel/analytics`) |
| 8 · `ai_insights` + retención 15 d | ✅ (migración solo en `m2-preview`) | `45f4da0` |
| 9 · `/api/ai/analyze` + `/api/ai/cron` + pipeline | ✅ | `feat(ai): pipeline por lotes con fallback determinista y endpoints analyze/cron` |
| 10 · panel IA en dashboard | ✅ | `feat(dashboard): panel IA con estado degraded honesto` |
| 11 · cierre M3 | ✅ | `feat(m3): cierre del hito — docs, copy honesto de contacto y baches` |

### 9.1 Desvíos respecto al plan (y por qué)

- **D9 vs código**: `/api/ai/analyze` devuelve `{cached:true, insight}` usando el dedup por `facts_hash` (<5 min) del pipeline; no hay segundo chequeo de “último insight” separado. Mismo resultado observable, una sola ruta de dedup.
- **`recommendations_json`**: se persiste como objeto `{ findings, recommendations }` (§11.2) y el lector tolera el formato histórico de array de strings. Se corrigió el parser, que devolvía `findings: []` para el formato objeto.
- **Panel IA**: se implementó como card en `/dashboard/overview` (refresh 30 s, D8). No se creó `/dashboard/ai` (opcional en el plan).
- **Task 5 (decisión delegada, superada el 2026-11-04)**: no se integra provider de email. El endpoint validaba, aplicaba rate limit por IP (10/h) y registraba en logs; el copy público se ajustó para no prometer entrega por correo. Motivo: un proveedor de email añade un encargado de tratamiento que la política de privacidad aprobada (`ff46e27`) no cubre.
- **Task 5 — canal LinkedIn (decisión del usuario, 2026-11-04)**: se retira el formulario, `POST /api/contact`, `lib/contact/*` y su componente cliente. `/contacto` publica el perfil `linkedin.com/in/juanfpalacios` como canal único de soporte, comercial y divulgación. Motivo: LinkedIn no expone API pública para enviar mensajes a perfiles personales (solo Pages Messaging y Communications API restringida a partners), por lo que el envío desde el sitio no es viable; además el formulario anterior solo escribía en logs y no entregaba nada. `privacy` §1/§4/§6 y `terms` §7 se actualizaron: el sitio ya no recaba datos personales.

### 9.2 Baches abiertos al cierre de M3

1. ~~**Entrega real de `/api/contact`**~~ — **cerrado (2026-11-04)**: el sitio ya no recolecta mensajes; el canal es el perfil de LinkedIn (ver §9.1).
2. **Migración `0001_ai-insights`** aplicada solo a `m2-preview`; no existe autorización para `[default] production`.
3. **Cron externo de IA** — falta crear la tarea en cron-job.org contra `POST /api/ai/cron` con `x-cron-secret`, y definir `CRON_SECRET` en Preview/Producción.
4. **`OPENROUTER_API_KEY`/`AI_MODELS`** — sin key la IA queda en `degraded` (comportamiento diseñado, no error). Los modelos `:free` por defecto son frágiles.
5. **Verificación visual del panel IA** — pendiente de sesión admin real en Preview (el build y los tests cubren el contrato, no el render autenticado).
6. **Bug conocido del agente** (`confirm()` incondicional) — fuera de alcance M3 por decisión explícita.
7. **`/dashboard` sin enlace al panel IA** — no hay ruta dedicada; si se necesita detalle, es v1.1.
