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

## Diferidos y aprobados con dueño

| Ítem | Origen | Prioridad |
|---|---|---|
| Evidencia física del globo de bandeja | Stage 0 | Media |
| Fix de pegado del token en el enrolamiento | Stage 0 | Media |
| M3.6 chatbot (PDF/Markdown, incident response guiado, tendencias) | M3.5 | Media |
| Drill-down del dashboard | Ruta B | Media |
| M6 OT — **aprobado** (2026-11-25): hito nuevo; F1 OT en allowlist + descubrimiento manual; baseline automático a F1.5/F2; checkpoint tras E2.0/E2 | Roadmap | Aprobado — ejecución por etapas |
| Parser IPv6 | Backlog técnico | Media |
| Multi-interfaz | Backlog técnico | Baja |
| `ArcSwap` condicional al bench | Backlog de rendimiento | Baja |
| Roadmap Fases 2–5 (PCAP export/import, BPF, notificaciones Resend/webhooks, API, PWA en vez de iOS) | Roadmap | Planificación |
| Control por duración de la instrumentación (`SC_GUI_STAGE0_SECONDS`, D5) | Stage 0 | Baja, con el P0 |

## Decisión del propietario — M6 OT (2026-11-25)

**M6 OT aprobado como hito nuevo**, con **F1 OT acotado a allowlist +
descubrimiento manual**. El baseline automático del diseño (`ot_baseline`,
arming de 7 días y ≥100 ventanas) queda diferido a **F1.5/F2** y requiere un
piloto OT real y métricas de falsos positivos antes de anunciarse.

- **Detección F1 OT:** `ot_new_master` alerta cuando un `client/master` con
  confianza `confirmed` no figura en la allowlist del dispositivo. En F1 la
  allowlist se mantiene en la configuración local del agente; editarla desde el
  dashboard queda fuera de alcance.
- **Descubrimiento manual:** el agente lista los maestros observados en
  `ot_assets` (`role`, `protocols`, `last_seen`); el operador los promueve a la
  allowlist. No hay arming ni transiciones automáticas de baseline en F1.
- **Contrato:** `baseline_*` queda en `disabled`/null y la evidencia de
  `ot_new_master` usa `allowlist_version` en lugar de `baseline_days`/
  `baseline_epoch`. Se aplica en E2 con schema, Zod y serde en el mismo cambio.
- **Pendientes que no bloquean E2.0:** P11 (licencia de pcaps DEFCON) y P12
  (piso Neon) siguen abiertos; E2.0 usa fixtures sintéticos propios y no toca
  Neon.
- **Autorización:** esta aprobación **no** habilita ejecutar etapas. Cada una
  sigue necesitando un "dale" explícito que la nombre (AGENTS.md §3.2).

### Checkpoint E2.0/E2 (gate del propietario)

Se evalúa al cerrar E2.0 y E2, antes de autorizar E3–E10.

| Verificación | Comando exacto | Evidencia mínima en el tablero |
|---|---|---|
| Firmas E2.0 | `cd agent && cargo test -p sc-core ot_signatures` | `test result: ok`; 4/4 protocolos, 0 fallos; salida cruda recortada y código de salida |
| Gate completo de contratos | `bash scripts/verify-contracts.sh` | termina en `Contratos OK (Rust + JSON Schema + Zod).` y `exit 0` |
| JSON Schema | `node scripts/validate-contracts.js` | `Contratos OK.`, sin `FAIL:`, `exit 0` |
| Zod | `cd web && node --experimental-strip-types ../scripts/test-contracts-zod.mjs` | `# fail 0`, `exit 0` |
| Fixture 0.1.8 sin `ot` | incluido en `verify-contracts.sh` (Rust `ejemplo_del_contrato` + Zod) | el fixture valida y serializa idéntico; pegar nombre del test y resultado |

La respuesta HTTP 200 del fixture 0.1.8 se verifica en E7, no en este checkpoint;
aquí se valida schema/Zod/serde. Si `pnpm` bloquea `verify-contracts.sh` por el
lockfile, se corren los comandos directos de la tabla y se deja constancia de la
limitación; un gate parcial no cierra el checkpoint.

**Registro:** la evidencia va en las celdas de E2.0 y E2 del tablero, con comando,
salida cruda y código de salida. La decisión del propietario (`aprobado`,
`rechazado` o `vuelve a diseño`) se registra en la bitácora. Si 2 o más protocolos
fallan, M6 vuelve a diseño y no se escribe contrato; si falla el contrato, se
corrige dentro de E2. El checkpoint no autoriza E3–E10 en bloque: cada etapa
necesita un "dale" que la nombre.

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
