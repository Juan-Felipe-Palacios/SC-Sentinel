# THIRD_PARTY_NOTICES — SC-Sentinel (Strategic Connex Anomaly Shield)

Este producto es software propietario de **Strategic Connex** e incorpora componentes de terceros bajo sus propias licencias. Las obligaciones de cada uno se respetan listados aquí y conservando los avisos en el código fuente heredado. Módulo: se regenera/completa con `cargo deny` + build de `pnpm` antes de cada release (release-checklist).

## 1. Código fuente heredado (extracción dirigida)

| Componente | Uso en SC-Sentinel | Licencia original |
|---|---|---|
| Sniffnet (https://github.com/GyulyVGC/sniffnet) − `networking/capture.rs`, `networking/parse_packets.rs`, `networking/manage_packets.rs` | base de `sc-capture` | MIT / Apache-2.0 (doble) |
| Sniffnet − `networking/ipfix/*` (collector NetFlow/IPFIX) | base de `sc-collector` | MIT / Apache-2.0 |
| Sniffnet − `mmdb/` (integraciones MaxMind) | base de `sc-geo` | MIT / Apache-2.0 |

Los archivos heredados conservan sus headers de licencia originales. Sniffnet © Gulian Vardanyan y colaboradores. **No se usa la marca "Sniffnet" en superficies de usuario de SC-Sentinel** (ADR-0006).

## 2. Bases de datos embebidas / dependencias de datos

| Componente | Uso | Licencia / condición |
|---|---|---|
| MaxMind GeoLite2 (Country / ASN, .mmdb) | geolocalización de hosts (sc-geo) | CC BY-SA 4.0 + condiciones especiales del EULA — ver `maxmind-notice.md` |

## 3. Software del entorno (no redistribuido)

| Componente | Uso | Condición |
|---|---|---|
| Npcap (Windows) | driver de captura de paquetes | Instalado por el usuario; NO se redistribuye — ver `npcap-notice.md` |
| libpcap (Linux) | driver de captura de paquetes | BSD-style, vía sistema |

## 4. Crates de Rust (binarios del agente)

Licencias dominantes: **MIT / Apache-2.0** (ecosistema Rust). Listado completo y auditado en cada release con `cargo deny check --license` / `cargo audit`; esta sección cita los principales al momento del release: tokio, serde/serde_json, schemars, thiserror, anyhow, tracing, reqwest (rustls), rusqlite, backoff, config, clap, uuid/ulid, sha2, hmac, secrecy, flate2, zstd (opcional), insta (dev), proptest (dev), windows-service, pcap, etherparse.

## 5. Web (npm — inventario real de `web/package.json`, noviembre 2026)

Licencias dominantes: **MIT / Apache-2.0**. Inventario efectivo de la aplicación y sus herramientas:

**Runtime (se distribuyen en el bundle / en el servidor):**

| Paquete | Licencia |
| --- | --- |
| Next.js 15.5.28, React 19 / React DOM 19 | MIT / MIT |
| TypeScript 5.9 | Apache-2.0 |
| Tailwind CSS 4 (@tailwindcss/postcss) | MIT |
| @neondatabase/serverless | MIT |
| drizzle-orm | Apache-2.0 |
| jose | MIT |
| lucide-react | ISC |
| recharts | MIT |
| swr | MIT |
| date-fns | MIT |
| zod | MIT |

**Desarrollo / construcción (no se distribuyen en runtime, listados por completitud):**

ESLint 9 + eslint-config-next 15.5.28 + @eslint/eslintrc (MIT), Vitest 5 (MIT), drizzle-kit (MIT/ISC — verificar audit por release), @tailwindcss/postcss (MIT), @types/node, @types/react, @types/react-dom (MIT).

La corrida de `pnpm licenses list` de cada pre-release es la fuente auditable; esta lista es la foto al publicar la página.

## Obligaciones operativas

1. Regenerar el inventario antes de cada release (checklist de `testing/release-checklist.md`).
2. Publicar esta página (o su render MDX) en `/legal/third-party-notices` (hito M3 — **publicada**, ver feat(legal)).
3. No eliminar headers de licencia en código heredado; agregar archivo nuevo = agregar aviso aquí.
4. Cualquier componente con licencia no descrita en este archivo requiere revisión antes de merge (cargo-deny y licensías npm en CI fallan antes, normalmente).
