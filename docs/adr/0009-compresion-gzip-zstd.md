# ADR-0009 — Compresión: gzip con soporte obligatorio; zstd opcional recomendado (off por defecto en v1)

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §5.1, §8.3

## Contexto

Los snapshots tienen 2–10 KB JSON. La compresión ayuda en spool grande y lotes de drenaje, pero los niveles serverless (edge vs runtime Node) tienen soporte de descompresión poco transparente y no confiable para `Content-Encoding` de payloads de POST.

## Decisión

- El servidor soporta **gzip y zstd**: la elección por configuración del agente (`compression = "gzip" | "zstd"`).
- **v1: gzip por defecto.** zlib viene en el runtime Node (descompresión garantizada in-route) y a estos tamaños la diferencia con zstd es marginal.
- **zstd: opcional recomendado, flag cerrado en v1.** Descompresión en-route con `fzstd` (JS puro, sólo decode). Puede pasar a default en M2+ si hay medición que lo justifique.
- **La descompresión SIEMPRE la hace la route explícitamente** (zlib stdlib para gzip; fzstd para zstd). El contrato no confía en transporte transparente.

## Alternativas consideradas

- **zstd obligatorio desde v1**: mejor ratio, pero añade la dependencia `fzstd` a la ruta crítica y no hay medición que lo justifique en v1. Descartado (reversible).
- **Sin compresión**: simplifica el contrato, pero penaliza spool y drenaje. Descartado.
- **brotli**: no tiene ventaja sobre gzip aquí y edge coding behavior es variable. Descartado.

## Consecuencias

- `Content-Encoding: gzip | zstd` en headers del POST (spec §5.1); el servidor valida y decodifica antes de zod validate.
- Test unitario de compresión tanto en agente (flate2 / zstd crate) como en contratos web.
