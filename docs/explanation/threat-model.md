# Explicación — modelo de amenazas (STRIDE)

Basado en `docs/security/audit-2026-11-09.md` (H1–H7, M1–M8, L1–L5).

## Activos

- Tokens de device (escritura de datos).
- Cookie de sesión admin (control total).
- Datos de red agregados (hosts, alertas, health).
- Claves de IA (cuota y coste).
- Trust Pages (enlaces públicos).

## Amenazas (STRIDE)

| Categoría | Ejemplo en SC-Sentinel | Mitigación |
|---|---|---|
| Spoofing | robo de token de device | hash SHA-256, rotación (M7), HTTPS obligatorio (H5) |
| Tampering | payload manipulado en `/api/ingest` | validación zod, límites de tamaño (H3) |
| Repudiation | acciones admin sin traza | `admin_audit_log` (L4, pendiente) |
| Info disclosure | Trust Page filtra IPs (H1), demo expone device (H2) | minimización de props, allowlist explícita |
| DoS | gzip bomb (H3), fuerza bruta login (H4) | límites de descompresión, rate limit |
| Elevation | bypasses de dev en prod (M2) | bandera explícita `SC_DEV_AUTH` |

## Límites de confianza

- El agente es semi-confiable: corre en el nodo del cliente; el servidor valida todo.
- La IA es no confiable: solo interpreta hechos persistidos; nunca crea alertas (ADR-0005).
- Los datos de red son no confiables: saneado en `context-builder` (M6).

## Pendientes

M4 (rate limiting distribuido) y L1–L5 (ver auditoría). Revisar tras cada release.