# UX — Copywriting (tono y textos v1)

## Voz y tono

- Español internacional profesional (rioplatense neutro, sin voseo en producto).
- Técnico-claro: explica sin jerga; nombra lo que hace y qué NO ve la nube.
- Seguro y sin alarma: las alertas son hechos del motor, no sensacionalismo.
- Persona: Strategic Connex (empresa de seguridad de red). Marca de producto: **SC-Sentinel — Strategic Connex Anomaly Shield**.

## Hero (Home)

- **H1:** "Ve lo que pasa en tu red. Sin enviar paquetes crudos a la nube."
- **Sub:** "SC-Sentinel analiza tu tráfico localmente con un motor determinista y publica solo señales agregadas a tu dashboard. Cuando algo raro sucede, te enteras con evidencia."
- **CTA principal:** "Contactar" → /contacto
- **CTA secundario:** "Conocer funcionalidades" → /funcionalidades

## Cómo funciona (3 pasos)

1. **Captura local** — el agente observa el tráfico en tu PC (o en tu router, vía NetFlow/IPFIX).
2. **Agregación determinista** — ventanas de 30 segundos resumen qué hosts, puertos y países dominan el tráfico; el motor local detecta anomalías con reglas concretas.
3. **Dashboard + IA** — la nube solo recibe esas señales agregadas; la IA analiza tendencias y sugiere acciones (hasta 1 análisis cada 15 minutos).

## Cards de features (Home / funcionalidades)

| Card | Encabezado | Cuerpo |
|---|---|---|
| Motor determinista | "Reglas concretas, no cajas negras" | Servicios well-known, geo por país/ASN, blacklist y umbrales — todo corre localmente y puede explicar exactamente por qué dispara |
| Señales agregadas | "Anonimización opcional, no obligatoria" | Con anonymize_hosts activo, la nube ve host marks HMAC-SHA-256 y conteos; por defecto el panel puede mostrar la IP |
| Alertas con evidencia | "Cada alerta trae sus hechos" | Verás la regla, la severidad, la ventana y las métricas que dispararon la alerta; podrás marcarla como revisada |
| IA asistente | "IA que ayuda, no que decide" | El análisis de IA interpreta hechos agregados y sugiere pasos; no crea alertas primarias ni bloquea tráfico |
| Offline-friendly | "Tus datos no se pierden" | Si la conexión cae, el agente guarda todo en un spool local hasta reconectar |
| Servicio Windows | "Instalá una vez. El agente vuelve solo" | Auto-start, recovery, stop con drenaje y GUI opcional de bandeja |
| Colector NetFlow/IPFIX | "También observa lo que no pasa por tu PC" | NetFlow v5/v9 e IPFIX normalizados a las mismas ventanas de 30 s |
| GeoLite2 ASN | "País y ASN, resueltos en el equipo" | Bases .mmdb locales, top_asns opcional y actualización sin recompilar |

## Privacidad (sección)

- Titular: "La nube recibe señales agregadas, no paquetes crudos."
- Cuerpo: "Con la anonimización activada, la dirección IP de tu red no sale del equipo. El dashboard muestra lo necesario para decidir: tendencias, picos y alertas con hechos."

## Página /security

- Titular: "La seguridad empieza por la nuestra."
- Bullets: autenticación por token rotante; secretos solo en el servidor; logs sin datos sensibles; retención estricta con limpieza diaria; dashboard detrás de una única cookie de administración firmada.

## CTAs

- Contacto: canal único por LinkedIn (`linkedin.com/in/juanfpalacios`); el sitio no tiene formulario ni `POST /api/contact`.
- Botones del producto: "Contactar", "Ver funcionalidades", "Ver novedades", "Abrir demo", "Analizar ahora" (panel IA).
- Prohibido: promesas exageradas ("impenetrable", "100% seguro"), fear-marketing.

## Actualización 0.1.6 (2026-11-14)

- Versión pública: 0.1.6. Plataformas: Windows con servicio y Linux como colector; macOS no está soportado.
- Modelos: `gemini-3.6-flash` / `gemini-3.5-flash`, con fallback OpenRouter y Groq.
- Nuevas superficies: `/novedades` con historial 0.1.0–0.1.6, servicio Windows, GUI `sc-gui`, GeoLite2 Country/ASN y colector NetFlow/IPFIX.
- No publicar: firma criptográfica de alertas, “RAG local”, “cero falsos positivos”, “zero-cost”, anonimización obligatoria, detección primaria por IA ni scripts de remediación automáticos.
- Descarga: no enlazar un ZIP 0.1.6 hasta que exista tag/release público; usar el canal de contacto.

## Copy de estados del dashboard

| Estado | Copy |
|---|---|
| Sin datos aún | "Esperando la primera ventana del agente. Verificá que el servicio esté corriendo." |
| `needs_enrollment` | "El agente no está autenticado. Rotá el token desde Settings." |
| IA degraded | "El análisis de IA no está disponible ahora. El motor determinista sigue activo y las alertas continúan funcionando." |
| Sin alertas | "Sin alertas en el rango seleccionado." |
| Agente offline | "El agente no reporta desde {fecha}. El spool local conserva los datos." |
