# Política de privacidad — DRAFT (revisión legal antes de publicar en M3)

> **Estado:** borrador interno para Strategic Connex. **No publicar** sin revisión legal. Ámbito v1: `sc-sentinel.vercel.app` (landing pública + dashboard de uso interno; single-device — ADR-0007). Marco de referencia si se publica con formularios: Ley 25.326 de Protección de Datos Personales (Argentina).

## 1. Qué recoge el sistema

**Del nodo local (agente):**
- Señales agregadas de tráfico por ventana de 30 segundos: conteos de bytes/paquetes, puertos y protocolos dominantes, países y cantidad de hosts, alertas generadas por reglas locales.
- Métricas de salud del agente (paquetes vistos/descartados, uso de CPU/memoria, estado del spool).

**Identificadores:**
- Clave de host hasheada (`host_key`, HMAC truncada) cuando `anonymize_hosts=true` (modo por defecto). En ese modo la IP real **no sale del equipo**; el campo `ip_display` se envía `null` (contrato `ingest-api.v1.md` §1.2).
- Identificadores técnicos del dispositivo (`device_id`, hostname del nodo, versión del agente) para administrar el enrollment.

**Del sitio público:** la landing no recaba datos personales salvo el formulario de contacto (nombre, email, mensaje), usado para responder la consulta.

## 2. Qué NO recoge

- Paquetes crudos ni contenido de tráfico (nunca se envían ni guardan).
- Flujos individuales: solo agregación por ventana.
- IPs reales de la LAN cuando está activa la anonimización.
- Credenciales: el token del agente se guarda hasheado (SHA-256); el plaintext se muestra una única vez al crear/rotar.

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
| OpenRouter | procesamiento temporal de hechos agregados para el análisis IA | modelos "free" de OpenRouter; recibe solo señales agregadas normalizadas, sin PII (ADR-0005) |
| MaxMind | geolocalización off-line (base embebida) | el país se calcula en el nodo local; no hay consulta online |

## 5. Seguridad

- Autenticación: token de agente (rotación manual) + cookie de administración firmada.
- Transporte: HTTPS only; payload comprimido (gzip) con límite 128 KB.
- Logs sin datos sensibles: nunca se registran tokens completos, header Authorization ni payloads crudos.
- Anonimización integrada `anonymize_hosts` (HMAC truncada) — ver también `/security`.

## 6. Derechos / contacto

El responsable del tratamiento es Strategic Connex. Los sujetos de datos formularios del sitio pueden solicitar acceso, actualización o supresión escribiendo al contacto del sitio (`/contacto`).

---

**Pendientes antes de M3** (checklist del revisor legal):
- [x] Definir titular/domicilio/contacto oficial de Strategic Connex → decisión del equipo (nov 2026): titular "Strategic Connex" sin domicilio físico publicado; contacto exclusivamente por `/contacto`.
- [x] Confirmar condiciones de cada DPA de terceros (Vercel, Neon, OpenRouter) → se mantiene la tabla de §4; sin publicación de DPA propios.
- [x] Verificar formulación aplicable (Ley 25.326) → el sitio publica el formulario de contacto, por lo que rige Ley 25.326.
- [x] Publicar en `/legal/privacy` la versión pulida → publicada en M3 (feat(legal)).
