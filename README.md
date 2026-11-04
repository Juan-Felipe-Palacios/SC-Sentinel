# SC-Sentinel — Strategic Connex Anomaly Shield

Monitor de red con motor determinista local + dashboard en la nube. El agente captura tráfico en el dispositivo (pcap / NetFlow), lo agrega en ventanas de 30–60 s y envía señales de métricas (NUNCA paquetes crudos) a un dashboard en Vercel. La IA actúa como asistente de interpretación; el motor determinista Servicio/umbrales/GeoIP es la fuente de verdad.

## Estructura

- `agent/` — workspace Rust (agente local: captura, agregación, sincronización). Ver `agent/README.md`.
- `web/` — Next.js 15 (dashboard + landing). Ver `web/README.md`.
- `docs/` — spec (fuente de verdad), ADRs, contratos, runbooks, testing. Empezar por `docs/README.md`.

## Desarrollo local (requerido: Rust stable, Node 20, pnpm 9)

```bash
# Agente
cd agent && cargo test && cargo run -p sc-agent -- --version

# Web
pnpm --dir web install
pnpm --dir web dev
```

Requisitos detallados y gates diarios: `docs/runbooks/local-development.md`.

## Estatus

- M0: scaffold + CI verde. M1: captura + agregación + sync. M2: ingesta en Vercel/Neon + dashboard v0.
- **M3 (actual, cerrado):** landing pública SSG (`/`, `/funcionalidades`, `/security`, `/contacto`, `/legal/*`), capa IA por lotes con fallback degradado (`/api/ai/analyze`, `/api/ai/cron`, panel IA), SEO/analytics y legales con sign-off. Cierre y baches abiertos: `docs/superpowers/plans/2026-11-05-m3-landing-ia-design.md` §9.
- Roadmap M4–M5: `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` §13.
