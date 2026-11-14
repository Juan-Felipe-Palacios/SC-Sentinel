# ADR-0019 — Reescritura del código derivado de terceros

**Fecha:** 2026-11-14 · **Estado:** Aceptada · **Supersede:** el enfoque de derivación con avisos de ADR-0006

## Contexto

Desde el inicio (ADR-0006) el agente mantenía módulos derivados del código de un proyecto de terceros (MIT/Apache-2.0): el parser de paquetes y los tipos de flujo en `sc-capture`, y la integración MaxMind en `sc-geo`, con headers de licencia originales y atribución en `THIRD_PARTY_NOTICES.md`. La obligación legal de conservar avisos y la identidad de marca ajena pesaban sobre un producto propietario que ya no necesita ese historial.

## Decisión

1. **Reimplementación propia** de los tres archivos derivados, conservando la semántica observable y la API pública exacta (contratos y tests intactos, todos verdes):
   - `agent/crates/sc-capture/src/parser.rs` (parseo IPv4/TCP/UDP y dirección).
   - `agent/crates/sc-capture/src/flow.rs` (tipos `FlowUpdate`/`Direction`/`LocalIpSet`).
   - `agent/crates/sc-geo/src/geolite2.rs` (resolución GeoLite2 Country/ASN y descubrimiento de rutas).
2. **Purga total de menciones** al proyecto de terceros: código, ADRs (0001, 0002, 0006 actualizados), avisos legales (`THIRD_PARTY_NOTICES.md`, `maxmind-notice.md`), specs y planes históricos, páginas web de marketing y legales, y atlas de documentación.
3. **Origen de datos re-documentado**: las bases GeoLite2 se descargan directamente de MaxMind (ver `agent/resources/geolite2/README.md` y `docs/legal/maxmind-notice.md`).

## Alternativas consideradas

- **Mantener derivación con headers** (status quo de ADR-0006): conserva una obligación legal y una identidad ajena para un cuerpo de código que ya es minoritario y estable. Descartado por decisión del propietario (2026-11-14).
- **Reescribir con ingeniería inversa ciega (clean-room estricto)**: costo alto sin beneficio adicional para este caso. Descartado.

## Nota de alcance de la reescritura (2026-11-14, decisión del propietario)

La reimplementación se hizo por **compatibilidad**: se conservó la semántica observable y la API pública exacta, partiendo del comportamiento del código previo, **no bajo protocolo clean-room** (el autor de la reescritura había tenido acceso al código original). Las licencias aplicables (MIT / Apache-2.0) permiten el uso propietario conservando avisos en "porciones sustanciales"; la lectura del propietario, registrada aquí por decisión explícita (2026-11-14), es que el resultado es una implementación original y no conserva porciones sustanciales. Si esa lectura cambiara, la vía cumplidora es restaurar los headers de licencia y la entrada correspondiente en `THIRD_PARTY_NOTICES.md` (el historial de git conserva el código y los avisos previos).

## Consecuencias

- El código fuente del producto es **100 % propio**: `THIRD_PARTY_NOTICES.md` pasa a listar solo dependencias (crates Rust, npm, datos MaxMind, entorno).
- Las dependencias de terceros (etherparse, pcap, maxminddb, tokio, etc.) siguen siendo crates normales con sus propias licencias; `cargo deny` las cubre como antes.
- La semántica y los contratos no cambian: los mismos tests (unitarios, fixtures, golden) validan las implementaciones reescritas; no hay cambio de comportamiento.
