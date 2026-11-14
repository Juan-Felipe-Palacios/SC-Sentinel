# THIRD_PARTY_NOTICES — SC-Sentinel (Strategic Connex Anomaly Shield)

Este producto es software propietario de **Strategic Connex** e incorpora componentes de terceros bajo sus propias licencias. Las obligaciones de cada uno se respetan listados aquí y conservando los avisos en el código fuente heredado. Módulo: se regenera/completa con `cargo deny` + build de `pnpm` antes de cada release (release-checklist).

## 1. Código fuente de terceros

**Ninguno.** Desde el 2026-11-14 (ADR-0019) todo el código fuente de SC-Sentinel es implementación original de Strategic Connex: el código que antes derivaba de un proyecto de terceros fue reescrito (misma semántica, misma API pública, tests verdes) y las menciones y headers de terceros fueron retirados (ADR-0006 registra la historia). Los avisos de esta sección se limitan a dependencias y datos.

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

## 4b. Crates de Rust (GUI `sc-gui`)

| Componente | Uso | Licencia / condición |
|---|---|---|
| egui / eframe / egui-winit / epaint 0.27 | ventana y bandeja de la GUI | MIT / Apache-2.0 (doble) |
| tray-icon 0.15 / muda | icono y menú de bandeja | MIT / Apache-2.0 |
| clipboard-win / error-code (vía arboard) | portapapeles de Windows | BSL-1.0 (Boost) |
| option-ext (vía dirs) | rutas de configuración del SO | MPL-2.0 (copyleft por archivo, sin modificar) |
| Fuentes por defecto de `epaint` (Ubuntu-Light, NotoEmoji, Hack) | se **embeben** en `sc-gui.exe` | SIL OFL-1.1 y Ubuntu Font License 1.0 |

Las fuentes embebidas se redistribuyen dentro del binario bajo OFL-1.1/UFL-1.0: no se renombran, no se venden por separado y los avisos de copyright de sus autores originales se conservan en este documento. `cargo deny check licenses` (gate de cada release) valida el árbol completo.

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
| flag-icons 7.6.0 | MIT |
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
