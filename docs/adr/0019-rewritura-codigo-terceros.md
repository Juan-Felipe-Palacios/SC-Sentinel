# ADR-0019 — Reescritura del código derivado de terceros

**Fecha:** 2026-11-14 · **Estado:** Aceptada · **Supersede:** el enfoque de derivación con avisos de ADR-0006

## Contexto

Desde el inicio (ADR-0006) el agente mantenía módulos derivados del código de un proyecto de terceros (MIT/Apache-2.0): el parser de paquetes y los tipos de flujo en `sc-capture`, y la integración MaxMind en `sc-geo`, con headers de licencia originales y atribución en `THIRD_PARTY_NOTICES.md`. La obligación legal de conservar avisos y la identidad de marca ajena pesaban sobre un producto propietario que ya no necesita ese historial.

## Decisión

1. **Reimplementación propia** de los tres archivos derivados, conservando la semántica observable y la API pública exacta (contratos y tests intactos, todos verdes):
   - `agent/crates/sc-capture/src/parser.rs` (parseo IPv4/TCP/UDP y dirección).
   - `agent/crates/sc-capture/src/flow.rs` (tipos `FlowUpdate`/`Direction`/`LocalIpSet`).
   - `agent/crates/sc-geo/src/geolite2.rs` (resolución GeoLite2 Country/ASN y descubrimiento de rutas).
2. **Atribución restaurada** al proyecto de terceros: los headers de copyright vuelven a `parser.rs`, `flow.rs` y `geolite2.rs` con el titular correcto; `THIRD_PARTY_NOTICES.md` y la página legal conservan el aviso y los textos completos de MIT y Apache-2.0 en el Anexo A.
3. **Origen de datos re-documentado**: las bases GeoLite2 se descargan directamente de MaxMind (ver `agent/resources/geolite2/README.md` y `docs/legal/maxmind-notice.md`).

## Alternativas consideradas

- **Mantener derivación con headers** (status quo de ADR-0006): conserva una obligación legal y una identidad ajena para un cuerpo de código que ya es minoritario y estable. Descartado por decisión del propietario (2026-11-14).
- **Reescribir con ingeniería inversa ciega (clean-room estricto)**: costo alto sin beneficio adicional para este caso. Descartado.

## Nota de alcance de la reescritura (2026-11-14, decisión del propietario)

La reimplementación se hizo por **compatibilidad**: se conservó la semántica observable y la API pública exacta, partiendo del comportamiento del código previo, **no bajo protocolo clean-room** (el autor de la reescritura había tenido acceso al código original). Por cautela legal se conservan la atribución, el aviso de copyright y los textos completos de MIT y Apache-2.0, sin perjuicio de que Strategic Connex considere que las reescrituras actuales son obras propias.

## Consecuencias

- El código fuente del producto incluye módulos derivados de Sniffnet v1.5.1; `THIRD_PARTY_NOTICES.md` conserva esa atribución y los textos de MIT/Apache-2.0, además de las dependencias (crates Rust, npm, datos MaxMind, entorno).
- Las dependencias de terceros (etherparse, pcap, maxminddb, tokio, etc.) siguen siendo crates normales con sus propias licencias; `cargo deny` las cubre como antes.
- La semántica y los contratos no cambian: los mismos tests (unitarios, fixtures, golden) validan las implementaciones reescritas; no hay cambio de comportamiento.
