# Design Draft — Ingest por lotes (SYNC-30)

> Borrador generado a partir de `docs/roadmap.md` §2. Documentación únicamente;
> no implementa código ni despliegues. Pendiente de revisión fresca (EGM goldfish).

## 1. Objetivo y no-objetivos

**Objetivo.** Permitir que el agente envíe varias ventanas en una sola petición a
`/api/ingest`, reduciendo el número de requests por sync de hasta 60 a un
máximo de 6 (con lotes de 10), sin romper el contrato actual de una ventana por
request ni el límite de 60 req/min por device.

**No-objetivos.**

- No cambiar el esquema de una ventana ni los campos obligatorios.
- No exportar PCAP ni exponer capturas.
- No modificar el límite de peticiones por minuto.
- No implementar multi-tenant.

## 2. Contexto y piezas afectadas

| Pieza | Ubicación | Relevancia |
|---|---|---|
| Ingest actual (1 ventana) | `web/app/api/ingest/route.ts:43-230` | Base del nuevo endpoint. |
| Rate limit IP | `web/app/api/ingest/route.ts:46` (20/20) | Sin cambio. |
| Rate limit device | `web/app/api/ingest/route.ts:73` (60/min, burst 30) | 1 token por lote. |
| Lectura del cuerpo | `web/app/api/ingest/route.ts:82` (`readIngestBody`) | Límite de tamaño. |
| Validación Zod | `web/app/api/ingest/route.ts:103` | Por ventana. |
| Persistencia | `web/app/api/ingest/route.ts:138-210` | Transacción por lote. |
| Token bucket | `web/lib/rate-limit/ingest.ts:1-70` | Reutilizar. |
| Spool local | `agent/crates/sc-agent/src/main.rs:900-924` (`sync_pass`) | Productor de lotes. |
| Drenaje final | `agent/crates/sc-agent/src/main.rs:1021-1047` (`drain_spool`) | Consume lotes. |

## 3. Contrato del endpoint

### 3.1 Request

```json
{
  "device_id": "dev_...",
  "windows": [
    { "...ventana 1..." },
    { "...ventana 2..." }
  ]
}
```

- `windows`: array de 1 a `MAX_WINDOWS_PER_BATCH` (default 10, máximo 25).
- Cada elemento cumple `IngestEnvelopeSchema`.
- `Content-Type: application/json`.
- Opcional: `Content-Encoding: gzip` (verificar soporte en Vercel).

### 3.2 Response

`200 OK`:

```json
{
  "status": "ok",
  "results": [
    { "window_id": "win_...", "status": "accepted" },
    { "window_id": "win_...", "status": "duplicate" },
    { "window_id": "win_...", "status": "rejected", "reason": "..." }
  ]
}
```

Estados por ventana: `accepted`, `duplicate`, `rejected`.

### 3.3 Errores

| Código | Condición |
|---|---|
| 400 | Cuerpo inválido, `windows` vacío o > límite. |
| 401/403 | Device no enrolado o `device_id` no coincide. |
| 413 | Cuerpo > 4.5 MB (Vercel) o > límite interno. |
| 429 | Rate limit excedido (device o IP). |
| 500 | Error interno; el agente reintenta el lote completo. |

## 4. Límites de tamaño

- Límite de Vercel: 4.5 MB por request/response
  (`vercel.com/docs/functions/limitations`, actualizado 2026-08-24).
- Límite interno sugerido: 1 MB sin comprimir (margen para encoding y headers).
- Con 10 ventanas de ~50 KB cada una → ~500 KB, dentro del margen.
- Verificar si Vercel acepta `Content-Encoding: gzip` en el request y si el
  límite se aplica a bytes transmitidos o descomprimidos. Si no se acepta,
  mantener JSON sin comprimir.

## 5. Idempotencia

- Clave: `window_id` (ADR-0008).
- Si una ventana ya existe en la base, devolver `duplicate` y no reinsertar.
- La idempotencia se evalúa dentro de la transacción del lote.

## 6. Comportamiento si una ventana del lote falla

- Validar todas las ventanas antes de persistir.
- Si una ventana es inválida: marcarla `rejected` con `reason`, persistir las
  válidas en la misma transacción, devolver 200 con resultados por ventana.
- Las ventanas `rejected` no se reintentan (van a dead-letter lógico).
- Si la transacción completa falla (error de DB): devolver 500; el agente
  reintenta el lote completo (las ventanas ya persistidas son idempotentes).
- Si el device no está enrolado: 401/403 para todo el lote; el agente
  re-enrola.

## 7. Rate limiting

- 1 token por lote, no por ventana.
- Mantener 60 req/min por device (burst 30) y 20/20 por IP.
- El agente respeta `Retry-After` en caso de 429 y reintenta el lote completo.

## 8. Comportamiento del agente

- `sync_pass` agrupa hasta 10 ventanas por lote.
- Cada sync vacía todo el spool, a ritmo < 60 req/min.
- En el drenaje final (45 s), enviar lotes hasta agotar tiempo o spool.
- Si queda remanente, registrarlo (`spool_pending`) y sincronizar en el próximo
  arranque.

## 9. Observabilidad

- Métricas: `ingest_batch_received`, `ingest_batch_windows`, `ingest_batch_rejected`,
  `ingest_batch_duration_ms`.
- Logs: `event="ingest_batch" windows=N accepted=A duplicate=D rejected=R`.
- No loguear payloads ni identificadores de host (clase B).

## 10. Seguridad

- Validar `device_id` contra el token enrolado.
- No aceptar `device_id` del cliente sin autenticación.
- Sanitizar `reason` en respuestas (no exponer internals de DB).
- Rate limit por IP y device.

## 11. Plan de pruebas

| ID | Escenario | Criterio |
|---|---|---|
| B1 | Lote de 10 ventanas válidas | 200, 10 `accepted`. |
| B2 | Lote con duplicado | `duplicate` para el duplicado, `accepted` para el resto. |
| B3 | Lote con ventana inválida | `rejected` para la inválida, resto `accepted`, 200. |
| B4 | Lote vacío | 400. |
| B5 | Lote > 25 ventanas | 400. |
| B6 | Cuerpo > 4.5 MB | 413. |
| B7 | Rate limit excedido | 429 con `Retry-After`. |
| B8 | Device no enrolado | 401/403. |
| B9 | Idempotencia tras reintento | Segundo envío del mismo lote → todos `duplicate`. |
| B10 | Error de DB | 500; reintento exitoso. |

## 12. Rollout

1. Implementar endpoint por lotes manteniendo el de una ventana.
2. Añadir flag `INGEST_BATCH_ENABLED` (default off).
3. Probar en laboratorio (M6/M7).
4. Activar en producción y medir 7 días.
5. Deprecar el endpoint de una ventana tras 30 días sin uso.

## 13. PARADA

Borrador de diseño. No implementa código ni despliegues. Pendiente de revisión
fresca (EGM goldfish) y aprobación del propietario.