# ADR-0006 — Extracción limpia de código de terceros (no fork in place)

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Actualizada 2026-11-14 (ver ADR-0019)** · **Deriva del spec:** §4, licencias

## Contexto

Un proyecto de terceros (MIT/Apache-2.0) aportaba el motor de captura que SC-Sentinel necesita: módulos de captura/parseo de paquetes y de geolocalización MaxMind reutilizables en gran parte. Pero era una aplicación de escritorio acoplada a su propia GUI (iced), y SC-Sentinel es un producto propietario con otra identidad.

## Decisión

**Extracción limpia (Opción B)**: crates nuevos desde el día 1, en directorio nuevo, extrayendo módulos dirigidos (sin heredar historia git, ni estructura, ni marca).

- Los archivos heredados conservaban sus **headers MIT/Apache-2.0** originales.
- `THIRD_PARTY_NOTICES.md` listaba las piezas heredadas y dependencias.
- **Sin marca del proyecto de terceros en ninguna superficie de usuario** del producto.
- El único refactor fuerte es el desacople iced→tokio de la captura; el colector IPFIX se implementó propio en M4.

## Alternativas consideradas

- **Fork in place**: hereda deuda, estructura GUI y reputación de marca de un proyecto ajeno a un producto propietario en crecimiento. Descartado.
- **Clean-room rewrite**: legalmente innecesario entonces (MIT/Apache permiten uso propietario con conservación de avisos); descartado por costo sin beneficio.

## Consecuencias

- Producto liviano y propio desde el día 1: los crates siguen convención SC (nombres `sc-*`).
- Obligación legal entonces: headers preservados + notices (responsabilidad documentada en `legal/`).

## Actualización 2026-11-08 — IPFIX propio en `sc-collector`

La extracción directa del módulo IPFIX de terceros no se concretó: el colector IPFIX se implementó en `sc-collector` (ADR-0014), con decodificador de IEs y cache de templates de NetFlow v9 propios.

## Actualización 2026-11-14 — Reescritura y purga (supersedida por ADR-0019)

Todo el código derivado de terceros (`sc-capture`: parser y tipos de flujo; `sc-geo`: integración MaxMind) fue **reescrito como implementación original**, con la misma semántica observable y la misma API pública (tests verdes). Los headers de licencia de terceros y las menciones fueron retiradas; `THIRD_PARTY_NOTICES.md` ya no lista código fuente heredado, solo dependencias. Esta decisión sustituye el enfoque de extracción con avisos por el de código 100 % propio.
