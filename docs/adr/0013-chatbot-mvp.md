# ADR-0013 — Security Chatbot MVP (M3.5)

**Fecha:** 2026-11-07 · **Estado:** Aceptada · **Deriva del hito:** M3.5

## Contexto

M3.5 agrega un asistente conversacional sobre la telemetría agregada de SC Sentinel. El esqueleto inicial de `/api/chat` no era seguro ni funcional: autenticaba con token de device, aceptaba `body.context.deviceId` (permitía consultar otro device), el filtro de 24 h comparaba `alerts.id` con una fecha, no persistía conversaciones y devolvía una respuesta canned sin LLM.

El objetivo del MVP es que un administrador autenticado pueda preguntar en lenguaje natural por el tráfico, hosts, puertos, países, alertas y salud del agente de **un único device autorizado**, recibiendo una respuesta en streaming basada solo en datos agregados de las últimas 24 h.

## Decisión

### 1. Autenticación de administrador y aislamiento por device

- `/api/chat` y `/api/chat/history*` usan `verifyAdminAuth` (cookie `sc_session`, `x-sc-admin-secret` o Bearer admin). No aceptan tokens de agente.
- El `device_id` se resuelve desde `?device_id=` o `DEFAULT_DEVICE_ID`, se valida contra `devices` y nunca se toma del body.
- El body del POST es estricto: solo `message` (1–2000 caracteres) y `conversationId` opcional. Cualquier campo extra —incluido `context.deviceId`— devuelve 400.
- El historial y el borrado se filtran por el device resuelto: una conversación de otro device devuelve 404.

### 2. RAG SQL agregado y acotado

- Se consulta una ventana fija de 24 h (`CHAT_CONTEXT_HOURS=24`).
- Todas las consultas que unen `host_stats` o `alerts` con `flow_windows` filtran `fw.device_id` y `fw.start_at` dentro del período.
- El contexto incluye: totales de bytes/paquetes/ventanas, cantidad de alertas, top 10 hosts (con `ip_display` y país más reciente no nulo), top 10 alertas, top ports/countries de la última `snapshot_json` y el último `agent_health`.
- No se envían paquetes crudos, payloads, tokens, variables de entorno ni datos de otro device.

### 3. Persistencia del historial

- Migración `0007_chat.sql`: `chat_conversations` (device_id FK cascade, título, timestamps, índice device+updated) y `chat_messages` (conversation_id FK cascade, role, content, tokens_used, metadata_json, timestamp, índice conversation+created).
- `GET /api/chat/history` lista conversaciones o mensajes del device autorizado; `DELETE /api/chat/history/[id]` borra en cascada solo si la conversación pertenece a ese device.
- Se persiste el mensaje del usuario antes de abrir el stream y la respuesta del asistente al terminar. Si el stream se interrumpe, se guarda la respuesta parcial con `metadata.aborted=true`.

### 4. Streaming SSE y proveedores

- El endpoint responde `text/event-stream` con eventos `meta` (conversación, modelo, proveedor, fuentes, sugerencias, exportable, período), `token` (`{delta}`), `done` (tokens, latencia, warnings) y `error` (`{code,message}`).
- El cliente usa `fetch` + `ReadableStream` (no `EventSource`) para conservar cookies httpOnly y poder abortar.
- Proveedores: Groq y OpenRouter por API OpenAI-compatible; Gemini por `@google/genai`. Hay fallback de modelo y timeout de 30 s.
- El consumo se capa en 2000 tokens por consulta. Los errores se loguean por código, sin prompts ni claves.

### 5. Grounding y sugerencias

- Un validador extrae IPv4 de la respuesta y verifica que existan en el contexto serializado. Las IPs ausentes generan warnings visibles, no bloquean la respuesta.
- Las sugerencias se generan por intención (tráfico, hosts, alertas, salud o general) y se adaptan cuando no hay datos.
- La detección de pedidos de reporte/exportación solo marca `exportable`; **no** genera PDF/Markdown todavía.

### 6. Interfaz

- Widget flotante montado en el layout del dashboard, con estética cyberpunk (navy/cian, glow, grid/radar, robot SVG original).
- Launcher, panel responsive 420×600 (full-screen en móvil), header, empty state, chips de sugerencias, mensajes con Markdown seguro, caret de streaming, stop, nueva conversación y cierre con Escape.
- `role=dialog`, `aria-modal`, `aria-labelledby`, autofocus y `prefers-reduced-motion`.

## Alternativas consideradas

- **Mantener autenticación por token de device**: imposibilitaba una UI de dashboard con sesión de admin y dejaba abierta la consulta cruzada entre devices. Descartada.
- **Aceptar `deviceId` en el body**: simplificaba el cliente pero permitía que un admin/device consultara otro tenant. Descartada por seguridad.
- **WebSocket**: más infraestructura y estado para un caso request/response. SSE con `fetch` cubre streaming y abort de forma más simple. Descartada.
- **Llamar al LLM desde el navegador**: expone claves y rompe el aislamiento. Descartada.
- **Guardar el prompt completo en la base**: duplica datos sensibles y agranda el historial. Se guarda el mensaje, el contenido y metadata acotada. Descartada.

## Consecuencias

- El MVP queda cerrado para el alcance acordado: chat seguro, RAG de 24 h, streaming, historial y widget.
- **Fuera del MVP** (backlog M3.6): exportación PDF/Markdown (F9/CA8), workflow guiado de incident response (F10), comparación de tendencias entre períodos (F6/CA5), auditoría con identidad de usuario (F11) y auditoría WCAG 2.1 AA completa (CA14). No se declaran como entregados.
- El contexto fijo de 24 h limita preguntas sobre semanas/meses; para eso hará falta un RAG multi-período.
- La precisión (CA10) no tiene benchmark formal todavía; el validador de IPs es una mitigación, no una garantía.
- El costo depende del proveedor; el tope de 2000 tokens y el fallback de modelo acotan la exposición.
- La migración `0007_chat.sql` debe aplicarse antes de desplegar el backend (ya aplicada en preview y producción).

## Referencias

- `docs/contracts/chat-api.v1.md`
- `web/app/api/chat/route.ts`
- `web/app/api/chat/history/route.ts`
- `web/app/api/chat/history/[id]/route.ts`
- `web/lib/chat/` (`rag.ts`, `history.ts`, `llm.ts`, `validator.ts`, `context-builder.ts`)
- `web/lib/db/migrations/0007_chat.sql`
- `web/components/chat/`
- Commit de producto: `cb907c8`
