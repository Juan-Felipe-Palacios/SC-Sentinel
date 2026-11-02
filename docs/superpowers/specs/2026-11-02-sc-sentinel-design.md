# SC-Sentinel — Diseño de producto (Spec)

**Proyecto:** SC-Sentinel (Strategic Connex Anomaly Shield)
**Fecha:** 2026-11-02
**Estado:** SUPERSEDED por `SC-Sentinel-Spec-Completo-2026-11-03.md` (espec completo v2.1 — no usar como referencia salvo histórico)
**Propiedad:** Strategic Connex — software PROPIETARIO

---

## 1.Qué es

SC-Sentinel es un sistema de monitoreo y detección de anomalías de red en dos partes:

1. **Agent local (Rust)** — corre en la PC/nodo; captura tráfico (pcap) y/o recibe NetFlow v9/IPFIX; pre-agrega ventanas de 30–60 s y publica snapshots HTTPS a la nube.
2. **Nube (Next.js + Vercel)** — landing pública + dashboard privado con overview, hosts, conexiones, alertas y panel de análisis IA (OpenRouter modelos free).

**Principio rector:** el motor determinista (parser etherparse, tablas de ~6000 servicios, GeoIP MaxMind) SIEMPRE corre y es la fuente de verdad. La IA enriquece con análisis por lotes, nunca reemplaza al motor y nunca opera por-flujo.

## 2. Base de datos elegida

**Neon Postgres free tier.** Motivos:
- sinergia nativa serverless-Vercel (driver HTTP, mismo region).
- autosuspend no borra datos; agente offline semanas no rompe la DB.
- branching para preview deployments de Vercel.
- Capacidad 0.5 GB es suficiente (~2–5 MB/día) con cron cleanup.

## 3. Decisiones registradas

| Tema | Decisión |
|---|---|
| Arquitectura | **Extracción limpia** (Opción B) — crates nuevos desde día 1; NO fork in place |
| Fuente primaria | PC local vía pcap (M1/M2) |
| Fuentes secundarias | MikroTik RouterOS v7 IPFIX y Cisco NetFlow v9 vía collector heredado (M4) |
| Binarios | **Ambos**: `sc-sentinel` (GUI iced, híbrido posterior) + `sc-sentinel-agent` (daemon headless) |
| Audiencia dashboard | Uso interno (single-device, no multi-tenant) |
| Licencia | Propietaria Strategic Connex; módulos extraídos de Sniffnet quede MIT/Apache-2.0 headers + THIRDPARTY_NOTICES.md; sin marca "Sniffnet" en superficies de usuario |
| Identidad visual | Design tokens extraídos de strategicconnex.com.ar |
| DB | Neon Postgres free |
| IA | Modelos free de OpenRouter (sufijo `:free`) con cadena de fallback; batch ≤1 llamada/~5 min |
| Paleta realtime | SWR polling 5 s (no websockets) |

## 4. Estructura del repositorio

```
D:\ProyectosWeb\SC-Sentinel\
├── agent/                     # workspace Rust
│   ├── crates/
│   │   ├── sc-core/           # tipos dominio: FlowKey, HostStats, Alert, WindowSnapshot
│   │   ├── sc-capture/        # motor pcap (de networking/{capture,parse_packets,manage_packets}.rs)
│   │   ├── sc-collector/      # NetFlow v9/IPFIX (de networking/ipfix/*)
│   │   ├── sc-geo/            # MaxMind wrapper (de mmdb/)
│   │   ├── sc-detect/         # motor determinista: servicios, baseline, blacklist, umbrales
│   │   ├── sc-aggregate/      # ventana 30–60 s → WindowSnapshot (~2–10 KB JSON)
│   │   ├── sc-sync/           # HTTPS POST + device-token + spool SQLite (reintentos, cota 500 MB/7 días FIFO)
│   │   ├── sc-agent/          # bin daemon headless (servicio Windows, config TOML)
│   │   └── sc-gui/            # bin GUI iced (M5/híbrido)
├── web/ (Next.js 15, TS, Vercel)
│   ├── app/
│   │   ├── (marketing)/       # "/", /funcionalidades, /contacto — SSG público
│   │   ├── (dashboard)/       # /dashboard/* — protegido (middleware + cookie admin)
│   │   │   └── overview | hosts | connections | alerts | ai | settings
│   │   └── api/               # /ingest  /query  /ai/analyze  /cron/cleanup  /ai/cron
│   └── lib/                   # tokens SC, Drizzle+Neon, zod contracts
└── docs/                      # specs + THIRDPARTY_NOTICES.md
```

**Interfaces entre crates:**
- `sc-capture` → canal tokio mpsc de `FlowUpdate` hacia `sc-aggregate`
- `sc-aggregate` → `WindowSnapshot` (JSON versionado, campo `v`)
- `sc-sync` → `POST /api/ingest` con payload `{device, v, window, snapshot}`
- web consume solo `/api/ingest` y `/api/query`

**Extracción clave:** refactor único difí|lic = desacoplar iced de la lógica de captura (mensajes iced → eventos tokio). ipfix/ es ya autónomo (~95%). ~90% de capture se reutiliza.

## 5. Flujo de datos

```
PC (pcap) → sc-capture →(mpsc)→ sc-aggregate
                              │ ventana 30 s, snapshot ~2–10 KB
                              ▼
                        sc-sync (spool SQLite WAL)
                              │ online: batches POST /api/ingest + backoff
                              ▼
        Vercel /api/ingest → zod validate + device token
                              ▼
        Neon Postgres: devices, flow_windows, host_stats, alerts
                              ▲
        Dashboard SWR 5s ← GET /api/query
                              │
        /ai/cron (cada 5 min) → hechos último ~5–15 min de ventanas
                              → OpenRouter :free (cadena de fallback)
                              → tabla ai_insights → panel "Análisis IA"
```

**Reglas:**
- El snapshot contiene SOLO señales agregadas (top hosts/puertos/países, picos, alertas); nunca raw packets ni flujos individuales.
- Máximo 1 llamada IA por lote de ~5 min; si hay una en curso se cancela la siguiente (sin colas).
- Si la IA no está disponible permanente, el sistema funciona 100% determinista (flag `ai_status=degraded`).

## 6. Errores y resiliencia

| Fallo | Comportamiento |
|---|---|
| pcap sin privilegios / crash | backoff exponencial (1→60 s) + estado de salud en log local |
| Sin internet | spool local con cota 500 MB / 7 días FIFO; vaciado en batches al reconectar |
| 4xx/5xx del POST | backoff 1→60 s; nunca descarta datos |
| Token inválido | flag `needs_enrollment`; spool conservado |
| Límite openrouter free | cadena de fallback; agotado → modo determinista puro |
| DB fría (Neon cold start) | ~1 s de latencia tolerable; agente reintentar |

## 7. Seguridad

- device-token 32 bytes aleatorio, `Authorization: Bearer`, guardado hasheado (SHA-256) en Postgres.
- Opción `anonymize_hosts` (HMAC truncado de LAN IPs).
- HTTPS only, CORS cerrado, rate-limit por device en `/api/ingest`.
- `OPENROUTER_API_KEY` solo en server env de Vercel.

## 8. Testing

- Rust unit: golden snapshots de agregación, spool FIFO/cota, backoff, serialización ABI.
- Rust integration: PCAP fijo de loopback + HTTP mock server para `sc-sync`.
- Web: contratos zod ↔ serde; pruebas de API con Neon preview branch; Playwright e2e del dashboard/landing al final.
- Smoke M1: tráfico real del propietario publicado end-to-end.

## 9. Hitos

| M | Contenido | Duración |
|---|---|---|
| M0 | scaffold repo, git, CI cross-compile Win/Linux, extracción de módulos compila | 3–4 d |
| M1 | capture desacoplada + aggregate + sync (mock server) → datos reales end-to-end | 2 semanas |
| M2 | Vercel API+Neon+auth device + dashboard v0 | 1.5 sem |
| M3 | landing + design tokens + capa IA + panel IA | 1.5 sem |
| M4 | sc-collector para MikroTik RouterOS v7 IPFIX / Cisco NetFlow | 1.5 sem |
| M5 | daemon como Windows service + instalador + sc-gui (opcional) | 1–2 sem |

## 10. Dominios

- `scaudir.vercel.app` — deploy del Monorepo web (landing `/` y dashboard `/dashboard`).
- `strategicconnex.com.ar` — sitio de la empresa / marca; SC-Sentinel asocia los design tokens de allí.

## 11. Fuera de alcance (v1)

- Multi-device / multi-tenant, reportes PDF, notificaciones push móviles sc-gui final temas arbitrarios — re-evaluar post-M3.
