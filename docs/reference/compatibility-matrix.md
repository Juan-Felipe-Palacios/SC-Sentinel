# Referencia — matriz de compatibilidad

## Agente (Rust)

| Componente | Versión soportada |
|---|---|
| Rust toolchain | stable (ver `rust-toolchain.toml` si existe) |
| Sistema operativo | Windows 10/11 (servicio SCM), Linux (systemd), macOS (desarrollo) |
| Captura pcap | Npcap (Windows), libpcap (Linux/macOS) |
| Colector IPFIX/NetFlow | UDP, bind configurable (M4) |

## Web (Next.js)

| Componente | Versión |
|---|---|
| Node.js | 20.x |
| pnpm | 9.x |
| Next.js | 15.5.x |
| React | 19.x |
| TypeScript | 5.9.x |

## Base de datos

| Componente | Versión |
|---|---|
| Neon Postgres | serverless (HTTP/WebSocket driver `@neondatabase/serverless`) |
| Drizzle ORM | 0.45.x |
| Migraciones | Drizzle Kit 0.31.x |

## Navegadores (dashboard)

Chrome/Edge/Firefox/Safari últimas 2 versiones. SSE requiere soporte de `EventSource`. No se soporta IE.

## CI

GitHub Actions: `cargo test/clippy/audit`, `pnpm typecheck/lint/test/build`, `contracts.yml`. Dependabot para pnpm y cargo (recomendado).