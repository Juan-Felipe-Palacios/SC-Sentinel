# Registro de hallazgos — auditoría SC-Sentinel (borrador vivo, sin commitear)

Fecha: 2026-11-21. Español. Solo diagnóstico (N0). Los IDs se consolidan en la Fase 6 (B-001…).

## Presupuesto consumido (parcial)

| Concepto | Usado | Límite |
|---|---|---|
| HTTP a producción (curl -sSI, fase 2 §2) | 19 | 400 |
| Documentos navegados en el navegador (landing + 8 públicas + login + 8 repetidas + demo + 5 vistas + hosts + login×2 + lighthouse×3 + reload trace) | ~38 | (incluido en el total) |
| Total HTTP estimado a producción | ~57 | 400 |
| Consultas a la base (Neon) | 0 | 3 |
| Llamadas a IA | 0 | 20 |

Nota: `browser.network.list` falla (`[browser.operation_failed] ... Expected JSON value`), por lo que no se pueden contar los subrecursos (CSS/JS/imagenes) de cada carga. Se cuentan documentos; los subrecursos quedan **no verificados**.

## Hallazgos

| ID provisional | Severidad | Área | Síntoma | Evidencia | Causa probable |
|---|---|---|---|---|---|
| H-01 | medio | seguridad | La CSP de producción llega como `Content-Security-Policy-Report-Only`, no aplicada: nada bloquea scripts/frambujas maliciosos, solo reporta | `curl -sSI https://sc-sentinel.vercel.app/` → cabecera `Content-Security-Policy-Report-Only: ... upgrade-insecure-requests; report-uri /api/csp-report` en las 9 rutas públicas; `web/middleware.ts` (`resolveCspMode`, líneas 27-42) | Modo deliberado (rollout gradual) pero sin evidencia de paso a enforce |
| H-02 | bajo | consola | Error de consola en TODA página: "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy." | `browser.console(level=error)` en `/`, `/funcionalidades`, `/security`, `/contacto`, `/novedades`, `/legal/*`, `/login`, `/dashboard/*` | Directiva inerte en Report-Only |
| H-03 | medio | SEO/contenido | `meta description` ausente en las 3 páginas públicas medidas → Lighthouse SEO 0.8 | Lighthouse (1 corrida por página): `/` 0.8, `/funcionalidades` 0.8, `/security` 0.8; fallo `meta-description` | No hay `<meta name="description">` |
| H-04 | bajo | accesibilidad | `label-content-name-mismatch` en las 3 páginas | Lighthouse axe 4.12, mismo fallo en las 3 | Etiqueta visible distinta del accessible name |
| H-05 | bajo | accesibilidad/SEO | Accesibilidad 100 y Best Practices 100 en las 3 páginas públicas (resultado positivo) | Lighthouse scores accessibility=1, best-practices=1 | — |
| H-06 | medio | rendimiento | 4 tareas largas y **1937 ms de bloqueo del hilo principal** en la carga de la landing | `browser.trace.start/reload/stop/analyze`: `longTasks=4`, `longTaskBlocking=1937.03 ms`, trace 2288 ms | Inicialización pesada (DroneShow/canvas o chunk grande) |
| H-07 | bajo | enlaces | Link checker: todos los enlaces internos de las 9 páginas públicas resuelven (11 únicos, todos 200/307 ya verificados). Externos: maxmind.com → 200; linkedin.com → **999** (bloqueo anti-bot de LinkedIn, no es prueba de enlace roto) | `curl.exe -L -w "%{http_code}"` sobre los 2 externos | LinkedIn devuelve 999 a agentes |
| H-08 | bajo | UX | `/login` no tiene NINGÚN enlace (`a[href]` = 0): sin "volver al inicio" ni registro | `browser.evaluate("document.querySelectorAll('a[href]').length")` → 0 | Diseño de la página |
| H-09 | bajo | UX/estado | En `/dashboard/hosts` el estado vacío "Sin hosts en el período." se muestra durante la carga antes de que lleguen los datos | Captura de texto tras navegar: primera pasada mostró "Sin hosts en el período", segunda pasada mostró los 6 hosts. `HostDrillDown.tsx:173` renderiza el vacío cuando `hosts` está vacío, sin distinguir `isLoading` | Falta estado de carga en `HostDrillDown` |
| H-10 | info | demo | La demo rotula correctamente "DATOS DE DEMOSTRACIÓN / Tráfico sintético… / EXPIRA EN 61 MIN" en overview, alerts, hosts, connections, evals | Texto visible en las 5 vistas con cookie `sc_guest` | — |
| H-11 | info | aislamiento | El visitante NO puede entrar a `/dashboard/settings`: redirige a `/dashboard/overview` | Navegación a `/dashboard/settings` → URL final `/dashboard/overview` | `middleware.ts:57-59` |
| H-12 | bajo | i18n | "1 HOSTS" (plural fijo) en la tabla de países | Texto de la demo: "Alemania 1 HOSTS · 15.0%" | Pluralización |
| H-13 | no verificado | rendimiento móvil | No hay herramienta de viewport en el navegador disponible (viewport real 800×574) → capturas a 1440 y 390 px y Lighthouse móvil **no ejecutados** | `browser.evaluate` → `window.innerWidth=800`; `search(namespace=browser,"viewport")` solo devuelve `screenshot` | Limitación de herramienta; requiere Playwright (instalación → OK del propietario) |
| H-14 | no verificado | red | `browser.network.list` no funciona → fallos de red del navegador y violaciones CSP reportadas no capturables por esa vía | Error `Expected JSON value` en 6 intentos | Bug/limitación de la herramienta; se usó curl |

## Gates de calidad locales (Fase 2 §5) — VERDES

- Rust (`agent/`): `cargo fmt --check` ✓; `cargo clippy --workspace --all-targets -- -D warnings` ✓; `cargo test --workspace` → **296 passed, 0 failed, 1 ignored** (`sc_collector::wireshark_fixtures::payloads_wireshark_parsean_sin_panic`).
- Web (`web/`): `pnpm typecheck` ✓; `pnpm lint` ✓ (3 warnings `@typescript-eslint/no-unused-vars`, 0 errores); `pnpm test` ✓ **334 tests / 61 archivos + 6 contratos TAP (pass 6 / fail 0)**; `pnpm build` ✓ Next 15.5.28.

## Cabeceras de producción (19 peticiones)

Rutas públicas `/`, `/funcionalidades`, `/security`, `/contacto`, `/novedades`, `/legal/terms`, `/legal/privacy`, `/legal/third-party-notices`, `/login` → 200 con:
`Content-Security-Policy-Report-Only` (nonce por request, `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`, `report-uri /api/csp-report`), `Reporting-Endpoints: csp-endpoint="/api/csp-report"`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cache-Control: private, no-cache, no-store`.

- `/demo` → 307 a `/dashboard/overview`, cookie `NAME=sc_guest; Path=/; Secure; HttpOnly; SameSite=lax`.
- `/dashboard/overview` sin sesión → 307 a `/demo?next=%2Fdashboard%2Foverview`.
- `/no-existe-404` → 404; `/p/invalidtokenvalue` → 404 con `Referrer-Policy: no-referrer`.
- `/api/query`, `/api/trust`, `/api/devices`, `/api/export/stats` sin sesión → 401 con `Cache-Control: no-store`.
- `/api/csp-report` y `/api/ai/analyze` (HEAD) → 405.
- Los endpoints `/api/*` NO llevan cabecera CSP (solo las globales).
