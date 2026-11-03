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
3. **Dashboard + IA** — la nube solo recibe esas señales agregadas; la IA analiza tendencias y sugiere acciones (máx. 1 análisis cada 5 minutos).

## Cards de features (Home / funcionalidades)

| Card | Encabezado | Cuerpo |
|---|---|---|
| Motor determinista | "Reglas concretas, no cajas negras" | Miles de servicios reconocidos, geo por país, blacklist y umbrales — todo corre localmente y puede explicar exactamente por qué dispara |
| Señales agregadas | "Tu IP real nunca sale de tu red" | Modo de anonimización integrado: la nube ve claves hasheadas y conteos; no paquetes ni flujos individuales |
| Alertas con evidencia | "Cada alerta trae sus hechos" | Verás los datos que dispararon la alerta (volumen, consultas, picos) y podrás marcarlas como revisadas |
| IA asistente | "IA que ayuda, no que decide" | El análisis de IA resume tendencias y sugiere pasos; funciona por lotes y degrada elegantemente si no está disponible |
| Offline-friendly | "Tus datos no se pierden" | Si la conexión cae, el agente guarda todo en un spool local hasta reconectar |
| Infraestructura liviana | "En Vercel + Neon free" | Dashboard propio sin servidores que mantener: deploy único y costo casi cero |

## Privacidad (sección)

- Titular: "La nube recibe señales agregadas, no paquetes crudos."
- Cuerpo: "Con la anonimización activada, la dirección IP de tu red no sale del equipo. El dashboard muestra lo necesario para decidir: tendencias, picos y alertas con hechos."

## Página /security

- Titular: "La seguridad empieza por la nuestra."
- Bullets: autenticación por token rotante; secretos solo en el servidor; logs sin datos sensibles; retención estricta con limpieza diaria; dashboard detrás de una única cookie de administración firmada.

## CTAs

- Formulario de contacto: nombre, email, mensaje — respondemos en ≤ 1 día hábil.
- Botones del producto: "Contactar", "Ver funcionalidades", "Analizar ahora" (panel IA).
- Prohibido: promesas exageradas ("impenetrable", "100% seguro"), fear-marketing.

## Copy de estados del dashboard

| Estado | Copy |
|---|---|
| Sin datos aún | "Esperando la primera ventana del agente. Verificá que el servicio esté corriendo." |
| `needs_enrollment` | "El agente no está autenticado. Rotá el token desde Settings." |
| IA degraded | "El análisis de IA no está disponible ahora. El motor determinista sigue activo y las alertas continúan funcionando." |
| Sin alertas | "Sin alertas en el rango seleccionado." |
| Agente offline | "El agente no reporta desde {fecha}. El spool local conserva los datos." |
