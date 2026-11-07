# Contrato de API - Security Chatbot v1

**Estado:** MVP backend (M3.5) · **Última actualización:** 2026-11-07

> Este contrato cubre el backend del asistente. La UI flotante se construye como consumidor de estos endpoints.

## 1. Autenticación y aislamiento

`POST /api/chat` acepta **admin** o **visitante** (solo lectura):

- Cookie de sesión `sc_session`, o
- `x-sc-admin-secret: <ADMIN_SECRET>`, o
- `Authorization: Bearer <ADMIN_SECRET>`, o
- Cookie de visitante `sc_guest` (JWT de 1 h, emitida por `/demo` o `/api/auth/guest-login`).

El historial (`/api/chat/history`) y el borrado siguen siendo **exclusivos de admin**; un visitante recibe `403 forbidden`.

El `device_id` de un visitante sale **siempre del token** (`SC_GUEST_DEVICE_ID`, allowlist de un device). Para admin se resuelve desde `?device_id=` o `DEFAULT_DEVICE_ID`/primer device enrolado. **Nunca** se acepta `deviceId` en el body de la petición.

Todas las consultas RAG y de historial filtran por ese device. Una conversación de otro device responde `404` sin revelar si existe. El visitante no crea conversación ni persiste mensajes: `conversationId` es `null` en `meta`/`done` y su presupuesto baja a 1000 tokens (timeout 20 s).

## 2. `POST /api/chat`

```http
POST /api/chat?device_id=dev_... HTTP/1.1
Content-Type: application/json
x-sc-admin-secret: <ADMIN_SECRET>
```

### 2.1 Body (estricto)

```json
{
  "message": "¿Qué host generó más tráfico en las últimas 24 h?",
  "conversationId": "conv_... (opcional)"
}
```

- `message`: string, 1-2000 caracteres.
- `conversationId`: opcional; si se envía, debe pertenecer al device resuelto.
- Cualquier campo adicional (por ejemplo `context`) devuelve `400 bad_request`.

### 2.2 Respuesta SSE

`Content-Type: text/event-stream`. Eventos:

| Evento | `data` |
|--------|--------|
| `meta` | `{ conversationId, model, provider, sources, suggestions, exportable, period }` — `conversationId` es `null` para visitante |
| `token` | `{ delta }` |
| `done` | `{ conversationId, model, provider, tokensUsed, executionTimeMs, warnings, suggestions, exportable }` |
| `error` | `{ code, message }` |

- `tokensUsed` se limita a 2000 por consulta (1000 para visitante).
- `sources` resume hosts/alertas/salud usados como contexto.
- `warnings` incluye IPs citadas por el modelo que no existen en el contexto (grounding básico).
- Si el LLM falla después de emitir texto, el parcial se persiste con `metadata.aborted = true` y se emite `error`.

### 2.3 Errores

| HTTP | `error` | Causa |
|------|---------|-------|
| 400 | `bad_request` | JSON inválido, mensaje fuera de rango o campo extra |
| 401 | `unauthorized` | Sin sesión admin/visitante válida |
| 403 | `forbidden` | Visitante en una operación solo-admin |
| 404 | `no_device` | No hay device resoluble/enrolado |
| 404 | `not_found` | `conversationId` no pertenece al device |
| 429 | `rate_limited` | Límite de visitante excedido (`Retry-After`) |
| 500 | `internal_error` | Error inesperado (sin secretos en la respuesta) |

## 3. `GET /api/chat/history`

```http
GET /api/chat/history?device_id=dev_...&limit=20
GET /api/chat/history?device_id=dev_...&conversation_id=conv_...
```

- Sin `conversation_id`: `{ conversations: [{ id, title, createdAt, updatedAt, messageCount }] }`.
- Con `conversation_id`: `{ conversation, messages: [{ id, role, content, tokensUsed, metadata, createdAt }] }`.
- `limit`: 1-50, default 20.
- `404` si la conversación no pertenece al device.

## 4. `DELETE /api/chat/history/{id}`

```http
DELETE /api/chat/history/conv_...?device_id=dev_...
```

- Borra la conversación y sus mensajes (`ON DELETE CASCADE`).
- `{ deleted: true, conversation_id }` o `404 not_found`.

## 5. Contexto RAG

- Ventana: últimas **24 h**.
- Incluye totales de bytes/paquetes/ventanas, top 10 hosts (IP/país/bytes), top 10 alertas, top puertos/países de la última ventana y último `agent_health`.
- `host_stats` y `alerts` se unen con `flow_windows` y se filtran por `fw.device_id`.
- El prompt prohíbe inventar IPs/hosts/alertas y solo permite citar IPs presentes en el contexto.

## 6. Proveedores y streaming

- `resolveProvider()` usa `AI_PROVIDER` o la primera clave disponible: Groq → Gemini → OpenRouter.
- Groq/OpenRouter se consumen por SSE compatible con OpenAI; Gemini por `generateContentStream`.
- Timeout de 30 s; el stream se aborta si el cliente cierra la conexión.
- El modelo puede degradar al siguiente de `AI_MODELS` solo si falla antes de emitir el primer token.
