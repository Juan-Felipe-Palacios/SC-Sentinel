# ADR-0010 — Enrollment y rotación de token: manual, administrado desde el Dashboard Settings

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §5.1, §18.2, §21

## Contexto

Un agente necesita un device-token para autenticarse en `/api/ingest`. El dashboard en sí ya tiene cookie admin firmada; ¿cómo se crea la primera credencial y cómo se entrega al agente?.

## Decisión

- **Enrollment completamente manual y pre-autenticado**: el administrador crea el device desde **Dashboard → Settings**, que genera un token y lo muestra como **plaintext una sola vez** (no se vuelve a leer más).
- En la DB solo se guarda el hash SHA-256 del token (`devices.token_hash`).
- **Sin endpoints de enrollment pre-autenticados**: el dashboard ya está detrás de la cookie admin; no se expone ninguna ruta pública para crear tokens.
- **Rotación**: botón en Settings revoca el token anterior y emite uno nuevo (también visible una sola vez). El agente que dejó de ser válido entra en `needs_enrollment` (cuando la API responde 401/403); su spool se conserva y se reanuda cuando se instala el nuevo token.
- En producción, el token del agente se lee de variable de entorno (`SC_INGEST_TOKEN`), no del config.toml.

## Alternativas consideradas

- **Enrollment in-band con código de aparatajo (claim code)**: acopla Backend y agente ya responsables de paths públicos; innecesaria para 1 device admin propietario. Descartada para v1 (fuera de alcance §21).
- **Token en config.toml plaintext**: aceptado solo como fallback local; se prefiere env para reducir el riesgo de commits con secretos.

## Consecuencias

- Cero superficie pública de autenticación crítica: la puertas de entrada son 2 (dashboard cookie admin + device token Bearer).
- Si se pierde el plaintext, se rota (nunca "recuperar").
