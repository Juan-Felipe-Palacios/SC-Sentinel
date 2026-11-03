# Runbook — Respuesta a incidentes

Escenarios predefinidos con playbook. Regla transversal del spec §8.1: **nunca se descartan datos silenciosamente**; toda pérdida debe quedar reflejada en la salud del agente.

## 1. Compromiso (o sospecha) de device-token

**Síntomas:** reintentos 401 sin causa, datos fantasma en dashboard, uso anómalo del rate limit (429 persistentes), ingesta desde IPs/conexiones no previstas.

1. Rotar el token inmediatamente (runbook `rotate-device-token.md`).
2. Establecer el momento del posible compromiso (logs de `ingest_batches.received_at`: ventanas duplicadas, gaps).
3. Revisar `payload_hash` de batches: reenvíos idénticos son benignos; hashes distintos con mismo window_id post-replay son señal de inyección.
4. Los datos ya insertados vía replay son SOLO señales agregadas (no exfiltran nada nuevo: el atacante no puede LEER la DB ni el dashboard — única superficie de lectura es la cookie admin). Riesgo principal: **integridad** de métricas/alertas.
5. Si se sospechan datos falsificados: borrar las ventanas del rango de tiempo afectado y reconstruir la vista del dashboard; documentar en changelog de operaciones.

## 2. Compromiso de cookie admin / sesión dashboard

1. El endpoint `/api/ingest` NO expone lectura: daño limitado a la vista del dashboard (IPs están anonimizadas si estaba activo `anonymize_hosts`).
2. Rotar la cadena/secreto de la cookie (env Vercel `SESSION_SECRET` o análogo) → invalida todas las sesiones.
3. Cambiar credenciales de acceso a Neon y a la cuenta Vercel si hay sospecha de acceso a esos sistemas.

## 3. Alarma de capacidad DB (>400 MB)

1. Ejecutar checklist de `database-cleanup.md`.
2. Ejecutar cleanup manual adelantado (con el secret).
3. Si tras cleanup sigue >400 MB: verificar tamaño por tabla y considerar reducir retención (spec §12.1 documentado como parámetro); abrir decisión ADR si se requería modificar la política.

## 4. IA en `degraded` persistente

1. Confirmar con `/api/ai/analyze` (bajo demanda) si devuelve `status:"degraded"`.
2. Verificar la cadena de fallback: probar modelos `:free` individualmente (env `OPENROUTER_API_KEY`, solo server-side).
3. Si es límite de cuota del free tier: esperar ventana; el sistema permanece 100% determinista (no es out-of-service). El cron de IA reintenta cada 5 min con dedup por `facts_hash`.

## 5. Violación de privacidad (IP real/hostname en la nube)

**Síntoma:** un snapshot muestra `ip_display` con valor real pese a que `anonymize_hosts=true` (contrato prohibido).

1. Verificar versión del agente: el contracto debe enviar `null` (spec §5.1). Identificar el build incumplido y detener: pausar el agente si la versión es la culpable.
2. Borrar de la DB los snapshots afectados (rango `window_start` de los batches con la versión incumplida).
3. Regenerar/rotar el secreto HMAC de `host_key` si es extrapolable (la HMAC es truncada; evaluación de riesgo del propietario).
4. Nota en changelog de operaciones + issue que re-produzca la causa raíz con fixture (sin datos reales).

## 6. Pérdida de datos por FIFO del spool

**Síntoma:** log `data_loss_bytes` / `data_loss_windows` (semanas offline, spool lleno).

- Es el único caso de pérdida aceptado (spec §8: FIFO 500 MB/7 días).
- Acción: revisar por qué el nodo estuvo offline tanto tiempo (conectividad, token, servicio caído — runbook `troubleshoot-sync.md`).
- Registrar en el log de operaciones el rango de ventanas perdidas (figuran en el log local).

## 7. Incidente de proveedor (Vercel / Neon / OpenRouter)

| Proveedor | Efecto | Mitigación |
|---|---|---|
| Vercel caído | Sin dashboard ni ingesta | Spool absorbe todo (hasta 500 MB/7 d); al volver drena |
| Neon caído / cold start | POST con error temporal | Backoff del agente; dashboard vacío temporal |
| OpenRouter sin servicio | `ai_status: degraded` | Producto sigue 100% determinista |

## Post-mortems (obligatorio si hay pérdida de datos)

Formato breve: qué pasó · cuándo se detectó · impacto (ventanas/métricas) · causa raíz · acción correctiva · ítem de checklist agregado. Guardar en `docs/runbooks/postmortems/` y actualizar la matriz de síntomas del runbook correspondiente.
