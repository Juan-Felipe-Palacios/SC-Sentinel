# THIRD_PARTY_NOTICES — SC-Sentinel (Strategic Connex Anomaly Shield)

Este producto es software propietario de **Strategic Connex** e incorpora componentes de terceros bajo sus propias licencias. Las obligaciones de cada uno se respetan listados aquí (el código fuente del producto no incorpora código de terceros; ver sección 1). Módulo: se regenera/completa con `cargo deny` + build de `pnpm` antes de cada release (release-checklist).

## 1. Código fuente de terceros

**Ningún fragmento copiado de un proyecto externo.** El módulo se reescribió desde cero para garantizar compatibilidad con el runtime y la API pública del sistema, conservando la semántica y los contratos observables. El código fuente original permanece disponible en su repositorio público bajo su licencia original (ADR-0019). La reescritura no fue clean-room: se tuvo acceso al código fuente original, pero no se copió literalmente.

Notas:
- Cláusula de restauración: si en algún momento el autor original solicita explícitamente la atribución en una forma distinta, se restaurarán los headers y el archivo `THIRD_PARTY_NOTICES` con los textos de licencia originales en la siguiente release.
- Aclaración técnica: la reescritura no fue clean-room (se tuvo acceso al código fuente), pero no se copió literalmente, para evitar ambigüedad legal.

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
3. El código fuente del producto no incorpora código de terceros (sección 1): no hay headers de licencia de terceros que conservar. Si en el futuro se incorpora código de terceros, agregar su aviso aquí antes del merge.
4. Cualquier componente con licencia no descrita en este archivo requiere revisión antes de merge (cargo-deny y licensías npm en CI fallan antes, normalmente).
