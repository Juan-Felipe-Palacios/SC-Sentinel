# ADR-0012 — Dominio oficial: sc-sentinel.vercel.app

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §20

## Contexto

El despliegue necesita dominio público para landing y dashboard. Opciones: dominio vercel.app directo, subdominio corporativo, o dominio propio.

## Decisión

**`sc-sentinel.vercel.app` es el dominio OFICIAL** para v1:

- Landing `/`, dashboard `/dashboard/*`, API `/api/*`.
- Todos los endpoints del agente (`endpoint` en config.toml) apuntan aquí.
- `strategicconnex.com.ar` sigue siendo el dominio corporativo/marca (SC-Sentinel toma de allí design tokens e identidad visual) — pero NO aloja la aplicación.
- Futuro opcional (no v1): alias `shield.strategicconnex.com.ar` o dominio propio del mismo deploy de Vercel.

## Alternativas consideradas

- **`scaudir.vercel.app`**: nombre prevalente en docs previas que se unificó a SC-Sentinel; eliminado para evitar dos fuentes de verdad. Descartado.
- **Alias corporativo desde el día 1**: vice DNS extra pre-M3 sin valor de producto aún. Pospuesto.

## Consecuencias

- Documentación, configs, ejemplos y copy usan `sc-sentinel.vercel.app` como única referencia.
- El cambio futuro de dominio es un alias de Vercel + change en `endpoint` del config del agente (costo bajo).
