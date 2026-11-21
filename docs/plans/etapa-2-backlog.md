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

## Seguimientos de la auditoría ronda 2 (2026-11-21)

Estos ítems entran al backlog; **no abren frentes nuevos**. Cada uno conserva su
ID B-xxx y su prioridad del ranking v2. No se ejecutan sin la autorización de su
nivel (N0–N4).

| Ítem | Qué falta | Dueño | Prioridad | Nivel |
|---|---|---|---|---|
| **B-028** | Runbook de rotación por secreto y ventana de corte de `SC_HMAC_KEY`: discontinuidad de `host_key` aceptada con retención de 7 días, o versionado de clave si se exige continuidad. La decisión es del propietario. | Propietario | **Alta** | N4 |
| **B-029** | Decisión `anonymize_hosts` (privacidad vs. debug). Nota: los históricos guardan `ip_display` hasta la retención de 7 días; `host_key` es HMAC en ambos modos y no cambia al activar la anonimización. | Propietario | **Alta** | N1/N3 |
| **B-008** | Host always-on (NUC/VM, Ethernet, sin suspensión, arranque automático y watchdog) + `service_started_at`/`stopped_at` y motivo + UI «sin datos por mantenimiento». | Propietario (infra) / agente (código) | Media | N1/N3 |
| **B-030** | Política de ruteo explícita por entorno (`AI_PROVIDER`) y cadena de fallback logueada; dejar de depender del orden de detección de claves. | Agente | Media | N1/N2 |
| **B-031** | Status del proveedor en `chat_fallback`/`chat_stream_failed`: **medido en Preview** (`status=404`, `error=ApiError`) y cubierto por test. Queda el remanente de llevarlo a producción con el próximo release; no se reabre como investigación. | Agente | Media | N1/N2 |
| **B-032** | **Resuelto en lo versionado** (2026-11-21): las 3 menciones usan «GeoLite2 se distribuye bajo el MaxMind GeoLite EULA, que incorpora obligaciones de atribución CC BY-SA 4.0; no es una licencia CC BY-SA 4.0» (`d213436` THIRD_PARTY_NOTICES:17, `488a828` plan m0, `33b9943` LICENSE:12-15, `7f01d1b` citas 244 → 249). **Remanente:** `docs/qa/QA-2026-11-21.md` corregido en disco (línea 249) pero sin versionar; se cierra cuando el propietario autorice versionarlo. | Agente | Baja | N1 |

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
