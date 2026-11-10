# M5 — Servicio Windows + instalador (2026-11-10)

Rama: `feat/m5-windows-service` → `main`. Spec: §19 "Daemon como Windows service + instalador + sc-gui (opcional)". Checklist: `docs/testing/acceptance-criteria.md` §M5.

## Alcance decidido

- **Implementado:** control SCM en el binario, file-logging en servicio, instalador y desinstalador PowerShell, runbook reescrito, formularios de recovery (failure actions + auto-start + stop con drenaje).
- **Backlog (GUI):** `sc-gui` es opcional por la spec → NO implementado en M5; queda como nota en acceptance-criteria y plan propio cuando se recupere.

## Fases

- Fase 1: investigación de API (completada) — `windows-service` 0.8.1: `define_windows_service!`, `service_dispatcher::start` (error 1063 = lanzado por terminal, no por el SCM → modo CLI), handler con Stop/Shutdown/Interrogate, `ServiceStatus` con StartPending/Running/StopPending, service_main sync (runtime tokio manual). Referencias leídas de docs.rs + source del crate en la registry local.
- Fase 2: refactor del binario (completada) —
  - `sc-config`: `[log] file: Option<PathBuf>` (default None = stdout/cli; en servicio default `C:\ProgramData\SC-Sentinel\logs\agent.log`).
  - `sc-telemetry`: `logging::init_file_level(level, path)` con `tracing-appender` (rolling::never + non_blocking, `WorkerGuard` retenido el runtime).
  - `sc-agent/src/service.rs` (nuevo, target-dep windows): SERVICE_NAME `SC-Sentinel-Agent`, statics `IS_SERVICE` / `STOP_RX` / `STATUS_HANDLE`, `enter() -> RunMode {Service|Cli}`, bridge thread mpsc↔watch, `report_stop_pending()` para el drain >>30 s.
  - `sc-agent/src/main.rs`: sin `#[tokio::main]`; `fn main()` despacha a `service::enter()` o runtime manual; `run_cli() -> i32` y `run_agent(args) -> i32` (todos los cortes devuelven código en vez de `exit()` inline); `shutdown_signal()` en windows — `ctrl_c` + receiver del stop del servicio (borrow-first para la carrera pre-selected); tras el `select!` de terminación → `report_stop_pending()`.
- Fase 3: instalador/desinstalador + runbook (completada) — ver `scripts/install-agent.ps1`, `scripts/uninstall-agent.ps1`, `docs/runbooks/install-agent-windows.md`; formularios: `sc.exe create` con binPath quoted, failure actions `restart 5/10/30 s reset=86400`, `start= auto`, ACL icacls sin herencia para SYSTEM+Administradores, token/device en el environment del servicio (HKLM\...\Services\...\Environment), upgrade con spool persistente, borrado tanto con como sin `-PurgeData`.
- Fase 3b: correcciones del instalador (2026-11-10, tras diagnóstico de una instalación previa en sucio) —
  - Eliminado `--service` del binPath (flag inexistente en `Args` → clap rechazaba el arranque del servicio).
  - `config.toml` generado SOLO con claves reales de `sc-config` (`deny_unknown_fields`): se eliminaron secciones inventadas (`[agent]`, `[capture]`, `[aggregate]`, `[health]`, `timeout_secs`/`max_retries`/`flush_interval_secs`); `device_id` ahora viaja por `SC_SENTINEL_DEVICE_ID` en el `Environment`, no en el archivo.
  - Params nuevos: `-BinaryPath` (default `agent\target\release\sc-sentinel-agent.exe`, nombre real según `[[bin]]`) y `-CollectorPorts` (default 2055,4739; la prueba usa 2056,4739 porque el soak M4 mantiene el 2055).
  - Reinstalación idempotente (si el servicio preexiste → stop+delete) y limpieza del residuo `sc-agent.exe` de instalaciones viejas (el binario se llama ahora `sc-sentinel-agent.exe`).
- Fase 4: gates + prueba real —
  1. Gates verdes (2026-11-10): `cargo fmt --check`, `clippy --workspace --all-targets -D warnings`, `cargo test --workspace`, `scripts/verify-contracts.sh` (vía git bash); web `pnpm test` 6/6, `lint` 0 errores, `typecheck` 0, `build` 0. Tests: `parsea_argv_del_servicio`, `rechaza_flag_desconocido_del_binpath`, `log_file_es_optativo_y_se_lee_cuando_se_define`.
  2. PRUEBA FÍSICA (bache 1, ABIERTO): el ciclo completo está automatizado en `%TEMP%\m4-chr\run\m5-verify.ps1` (uninstall sucio → residuos → install con release fresco → `query`/`qc`/`qfailure` → log → `stop` (drain→Stopped exit code) → `start` → `taskkill /F` + recovery vía failure actions → uninstall + residuos → reinstall final RUNNING; transcript a `run\m5-verify.log`). Requiere una sola elevación; **tres lanzamientos `Start-Process -Verb RunAs` fueron cancelados en el prompt UAC** de esta estación (2026-11-10). Mientras tanto quedó verificada la smoke CLI del release con config real (file logging, drenaje, salida limpia).
  3. No verificable en esta estación: reboot real del server para auto-start (procedimiento documentado en el runbook §4; pendiente de ejecutar en una máquina de producción si UAC o reboot disponibles).

## Criterio de cierre

Los 7 checkboxes M5 de acceptance-criteria al día (GUI ↔ backlog documentado) y puerta perfecta al ciclo de release (firma Authenticode/instalador MSI si se requiere más adelante).
