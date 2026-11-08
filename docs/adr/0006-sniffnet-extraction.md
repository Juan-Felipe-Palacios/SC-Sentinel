# ADR-0006 — Extracción limpia de Sniffnet (no fork in place)

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §4, licencias

## Contexto

Sniffnet v1.5.1 (MIT/Apache-2.0) aporta el motor de captura que SC-Sentinel necesita: `networking/{capture,parse_packets,manage_packets}.rs` (~90% reutilizable), `networking/ipfix/*` (~95% reutilizable) y `mmdb/` (MaxMind). Pero Sniffnet es una GUI iced acoplada a su estructura, y SC-Sentinel es un producto propietario con otra identidad.

## Decisión

**Extracción limpia (Opción B)**: crates nuevos desde el día 1, en directorio nuevo, extrayendo módulos dirigidos (sin heredar historia git, ni estructura, ni marca).

- Módulos heredados conservan sus **headers MIT/Apache-2.0** originales (líneas de copyright de Gulian Vardanyan etc.).
- `THIRD_PARTY_NOTICES.md` lista todas las piezas heredadas y dependencias.
- **Sin marca "Sniffnet" en ninguna superficie de usuario** del producto.
- El único refactor fuerte es el desacople iced→tokio de la captura; `ipfix/` es ya autónomo.

## Alternativas consideradas

- **Fork in place**: hereda deuda, estructura GUI y reputación de marca de un proyecto ajeno a un producto propietario en crecimiento. Descartado.
- **Clean-room rewrite**: legalmente innecesario (MIT/Apache permiten uso propietario con conservación de avisos); disqualified por costo sin beneficio.

## Consecuencias

- Producto liviano y propio desde el día 1: los crates siguen convención SC (nombres `sc-*`).
- Obligación legal: headers preservados + notices (responsabilidad documentada en `legal/`).
- Queda explícito el reconocimiento público a Sniffnet vía THIRD_PARTY_NOTICES, no vía branding.

## Actualización 2026-11-08 — IPFIX propio en `sc-collector`

La extracción directa de `networking/ipfix/*` no se concretó: el colector IPFIX
se implementó en `sc-collector` (ADR-0014), reutilizando el decodificador de IEs
y el cache de templates de NetFlow v9. Se gana control sobre el parseo y se evita
acoplar el crate a una ruta del repositorio de Sniffnet sin garantía de estabilidad.
La captura pcap (`sc-capture`) sigue derivada de Sniffnet v1.5.1 y conserva sus
avisos de licencia.
