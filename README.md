# SC-Sentinel — Strategic Connex Anomaly Shield

Monitor de red con motor determinista local + dashboard en la nube. El agente captura tráfico en el dispositivo (pcap / NetFlow), lo agrega en ventanas de 30–60 s y envía señales de métricas (NUNCA paquetes crudos) a un dashboard en Vercel. La IA actúa como asistente de interpretación; el motor determinista Servicio/umbrales/GeoIP es la fuente de verdad.

## Estructura

- `agent/` — workspace Rust (agente local: captura, agregación, sincronización). Ver `agent/README.md`.
- `web/` — Next.js 15 (dashboard + landing). Ver `web/README.md`.
- `docs/` — spec (fuente de verdad), ADRs, contratos, runbooks, testing. Empezar por `docs/README.md`.
- `docs/atlas.pdf` — atlas de documentación completo en A4 vectorial (283 páginas: 91 docs + 12 diagramas SVG embebidos). Generado con Chrome headless print-to-pdf.
- `docs/diagrams/exports/` — 12 diagramas en formato vectorial: `.svg` (fuente), `.dxf` (CAD, uno por diagrama) y `.png` (3 diagramas clave). Conversión SVG→DXF vía `scripts/svg2dxf.py` (ezdxf).

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
- **M3 (cerrado):** landing pública SSG (`/`, `/funcionalidades`, `/security`, `/contacto`, `/legal/*`), capa IA por lotes con fallback degradado (`/api/ai/analyze`, `/api/ai/cron`, panel IA), SEO/analytics y legales con sign-off. Cierre y baches abiertos: `docs/superpowers/plans/2026-11-05-m3-landing-ia-design.md` §9.
- **M3.5 (cerrado):** chatbot seguro con RAG, streaming SSE e historial. Contrato: `docs/contracts/chat-api.v1.md`; decisión: `docs/adr/0013-chatbot-mvp.md`.
- **Ruta B v2 (entregada):** export CSV/XLSX con streaming y auditoría, AI Evals con coste/latencia/éxito y Trust Pages con rotación, revocación y access logs. Runbooks y métricas en `docs/`.
- **M4 (cerrado):** colector pasivo NetFlow v5/v9 + IPFIX integrado en el agente (ADR-0014), con métricas del colector persistidas en `agent_health` y visibles en el dashboard; validado con MikroTik RouterOS CHR, fixtures reales y soak de 24 h.
- **M5 (cerrado):** servicio Windows `SC-Sentinel-Agent` con recovery, logging a archivo, instalador/desinstalador y runbook verificados en una instalación real.
- **Release 0.1.0:** primer release funcional. Ver `docs/release/changelog.md`.
- **Demo pública:** `/demo` entra como visitante de solo lectura, sin credenciales ni configuración previa.
- Roadmap histórico M0–M5: `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` §13.
