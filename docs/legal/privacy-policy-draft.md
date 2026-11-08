# Política de privacidad — DRAFT (revisión legal antes de publicar en M3)

> **Estado:** borrador interno para Strategic Connex. **No publicar** sin revisión legal. Ámbito v1: `sc-sentinel.vercel.app` (landing pública + dashboard de uso interno; single-device — ADR-0007). Marco de referencia si se publica con formularios: Ley 25.326 de Protección de Datos Personales (Argentina).

## 1. Qué recoge el sistema

**Del nodo local (agente):**
- Señales agregadas de tráfico por ventana de 30 segundos: conteos de bytes/paquetes, puertos y protocolos dominantes, países y cantidad de hosts, alertas generadas por reglas locales.
- Métricas de salud del agente (paquetes vistos/descartados, uso de CPU/memoria, estado del spool).

**Identificadores:**
- IP del destino y clave de host hasheada (`host_key`, HMAC truncada). Por defecto el panel muestra IP y nombre de host (resuelto por DNS inverso en el servidor) para que el operador identifique el destino.
- Con `anonymize_hosts=true` la IP real **no sale del equipo**; el campo `ip_display` se envía `null` y el panel muestra solo la clave hasheada (contrato `ingest-api.v1.md` §1.2).
- Identificadores técnicos del dispositivo (`device_id`, hostname del nodo, versión del agente) para administrar el enrollment.

**Del sitio público:** la landing no recaba datos personales: no hay formularios ni campos de recolección. El contacto se realiza por el perfil de LinkedIn del responsable (ver `/contacto`), plataforma de un tercero; el contenido de esa conversación no se copia a nuestros sistemas.

## 2. Qué NO recoge

- Paquetes crudos ni contenido de tráfico (nunca se envían ni guardan).
- Flujos individuales: solo agregación por ventana.
- IPs reales de la LAN cuando está activa la anonimización.
- Credenciales: el token del agente se guarda hasheado (SHA-256); el plaintext se muestra una única vez al crear.

## 3. Retención

| Dato | Retención |
|---|---|
| Ventanas/snapshots (flow_windows) | 7 días |
| Alertas | 30 días |
| Métricas de salud | 7 días |
| Insights de IA | 15 días |
| Registro de batches (idempotencia) | 2 días |

Purga automática diaria (03:00 UTC). Si el spool local del agente supera su cota (500 MB / 7 días), se descartan los datos más antiguos por FIFO y la pérdida queda reflejada en la salud del agente (nunca es silenciosa).

## 4. Procesamiento por terceros

| Tercero | Rol | Nota |
|---|---|---|
| Vercel | hosting y ejecución de la aplicación | aplica su DPA estándar; la ingesta viaja cifrada (HTTPS) |
| Neon | base de datos Postgres gestionada | verificar área/región y DPA de Neon antes de publicar |
| Google Gemini, OpenRouter y Groq | procesamiento temporal de hechos agregados para el análisis IA | modelos "free"; reciben solo señales agregadas normalizadas, sin PII (ADR-0005) |
| MaxMind | geolocalización off-line (base embebida) | el país se calcula en el nodo local; no hay consulta online |

## 5. Seguridad

- Autenticación: token de agente (rotación manual) + cookie de administración firmada.
- Transporte: HTTPS only; payload comprimido (gzip) con límite 128 KB.
- Logs sin datos sensibles: nunca se registran tokens completos, header Authorization ni payloads crudos.
- Anonimización integrada `anonymize_hosts` (HMAC truncada) — ver también `/security`.

## 6. Derechos / contacto

El responsable del tratamiento es Strategic Connex. Los titulares de los datos procesados por el sistema pueden solicitar acceso, actualización o supresión escribiendo al contacto del sitio (`/contacto`, perfil de LinkedIn del responsable).

---

**Pendientes antes de M3** (checklist del revisor legal):
- [x] Definir titular/domicilio/contacto oficial de Strategic Connex → decisión del equipo (nov 2026): titular "Strategic Connex" sin domicilio físico publicado; contacto exclusivamente por `/contacto`.
- [x] Confirmar condiciones de cada DPA de terceros (Vercel, Neon, Google, OpenRouter, Groq) → se mantiene la tabla de §4; sin publicación de DPA propios.
- [x] Verificar formulación aplicable (Ley 25.326) → el sistema procesa señales agregadas de red y el sitio publica un canal de contacto, por lo que rige Ley 25.326.
- [x] Publicar en `/legal/privacy` la versión pulida → publicada en M3 (feat(legal)).
