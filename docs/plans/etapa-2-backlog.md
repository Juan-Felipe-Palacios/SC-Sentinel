# Backlog de Etapa 2

**Creado:** 2026-11-20, al cerrar la Etapa 1. **Dueño del backlog:** el
propietario. Este documento es la única lista de lo diferido: si un ítem no está
aquí, no está diferido, está olvidado.

## Decisiones del propietario (2026-11-20)

| Decisión | Veredicto |
|---|---|
| Primer trabajo de Etapa 2 | **P0: stall/spin de la GUI** (bug bloqueante de producto) |
| Primer hito de features | **Fase 1: DPI + blacklists + watchlist** |
| Stage 0 | Cerrado con cobertura parcial (13,5 %); criterio no alcanzado por limitación del instrumento |
| CSP | Enforce con 48 h de preview, tras resolver PR #8 |
| Release del cierre | v0.1.9 (sustituye a v0.1.8, publicada pero no desplegada) |

## P0 — Stall/spin de la GUI

Un `sc-gui` con 41 h sin emitir y ~85 % de un núcleo sostenido en un solo hilo.
Es lo primero: un GUI que se cuelga tras horas invalida cualquier feature que se
construya encima. Ticket completo con evidencia forense en
`docs/evidence/sc-gui-stage0-2026-11-18/ticket-contingente.md`.

Criterio de cierre: reproducción controlada, hilo identificado con símbolos,
test que falle antes del arreglo y corrida de 24 h que produzca las 288 ventanas.

## Hito Fase 1 — DPI nativo + blacklists + watchlist

Primer hito de features por valor de seguridad inmediato.

| Pieza | Nota |
|---|---|
| DPI nativo | Sin código GPL: nada de dissectors de Wireshark (ADR-0019 y §12 del AGENTS.md) |
| Blacklists | Listas autorizadas, evaluación en el nodo, determinista |
| Watchlist | Dispositivos vigilados con alerta explícita |

Antes de empezar: banco de escenarios sintéticos con anomalías inyectadas y
métricas (precisión, falsos positivos/día, tiempo hasta detectar). No se publican
tasas sin medición.

## Diferidos con dueño

| Ítem | Origen | Prioridad |
|---|---|---|
| Evidencia física del globo de bandeja | Stage 0 | Media |
| Fix de pegado del token en el enrolamiento | Stage 0 | Media |
| M3.6 chatbot (PDF/Markdown, incident response guiado, tendencias) | M3.5 | Media |
| Drill-down del dashboard | Ruta B | Media |
| M6 OT (hito nuevo sí/no, allowlist vs baseline) | Roadmap | Decisión pendiente |
| Parser IPv6 | Backlog técnico | Media |
| Multi-interfaz | Backlog técnico | Baja |
| `ArcSwap` condicional al bench | Backlog de rendimiento | Baja |
| Roadmap Fases 2–5 (PCAP export/import, BPF, notificaciones Resend/webhooks, API, PWA en vez de iOS) | Roadmap | Planificación |
| Control por duración de la instrumentación (`SC_GUI_STAGE0_SECONDS`, D5) | Stage 0 | Baja, con el P0 |

## Higiene pendiente de autorización

Nada de esto se ejecuta sin «dale» explícito y lista de rutas:

- 6 worktrees registrados: `SC-Sentinel-agentfix`, `SC-Sentinel-fix`,
  `sc-compare-7363ca1`, `sc-compare-7449899`, `sc-rel-wt`, `wsb-hotpath`.
- 3 archivos sin versionar en `docs/diagrams/`:
  `sc-sentinel-mapa.svg`, `sc-sentinel-mapa-completo.svg`,
  `sc-sentinel-mapa.excalidraw`.

## Reglas de Etapa 2

Mismo ritual que funcionó en Stage 0: brief anclado → design draft gateado → work
packages con commits atómicos → gates → evidencia. Un ítem entra a un hito solo
si tiene criterio de cierre verificable.
