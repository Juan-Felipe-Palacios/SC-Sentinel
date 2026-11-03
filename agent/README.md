<!-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados. -->

# `agent/` — Agente Rust de SC-Sentinel

Workspace Cargo del agente headless (daemon). Mapa de crates y jerarquía de dependencias según `docs/adr/0002-rust-agent.md` (DAG estricto, sin ciclos):

```text
sc-core  (tipos de dominio — sin deps de runtime ni de otros crates internos)
sc-capture / sc-collector / sc-geo  (fuentes) → sc-aggregate → sc-detect → sc-sync
sc-config / sc-telemetry  (transversales)
sc-agent (bin daemon, M1) · sc-gui (bin iced, M5)
```

| Crate | Rol | Estado |
|-------|-----|--------|
| `sc-core` | Tipos de dominio versionados con los contratos de `docs/contracts/` (`v: 1`) | completo (M0) |
| `sc-capture` | Captura pcap en thread bloqueante puenteado a `tokio mpsc` | esqueleto (M0, lógica en M1) |
| `sc-collector` | Fuentes de flujo (ipfix heredado) | esqueleto (M0) |
| `sc-geo` | MaxMind GeoLite2 (ISO alpha-2) | esqueleto (M0) |
| `sc-aggregate` | Agregación por ventanas de 30–60 s → `WindowSnapshot` | esqueleto (M0) |
| `sc-detect` | Motor determinista de `Alert` (blacklist/umbrales) | esqueleto (M0) |
| `sc-sync` | Cliente de `/api/ingest` con spool, backoff e idempotencia | esqueleto (M0) |
| `sc-config` | Config y secrets (TOML, keyring) | esqueleto (M0) |
| `sc-telemetry` | Logging y métricas de salud | esqueleto (M0) |
| `sc-agent` | Binario daemon (Windows service / systemd) | esqueleto (M0) |
| `sc-gui` | Binario GUI iced (M5) — consumidor, nunca dependencia del engine | M5 |

Referencias: `docs/adr/0002-rust-agent.md` (jerarquía), `docs/README.md` (set completo de docs), `docs/contracts/` (schemas normativos v1). Los comentarios y docs van en español internacional; identificadores en inglés.
