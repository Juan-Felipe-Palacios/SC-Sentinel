# Términos de uso — DRAFT (revisión legal antes de publicar en M3)

> **Estado:** borrador interno. No publicar sin revisión legal. Aplica al uso del sitio `sc-sentinel.vercel.app` y del software SC-Sentinel (agente + dashboard).

## 1. Identificación del servicio

Strategic Connex Anomaly Shield (**SC-Sentinel**) es software de monitoreo de red desarrollado y operado por Strategic Connex. v1 es de uso interno del propietario (ADR-0007): la landing pública es informativa; el dashboard requiere autenticación propia.

## 2. Licencia de uso del software

- El software es **propietario** de Strategic Connex. No se otorgan licencias de redistribución en v1.
- La compilación/instalación del agente está limitada a los equipos del operador autorizado.
- Módulos de terceros se rigen por sus licencias propias (ver `/legal/third-party-notices`).

## 3. Uso aceptable

- Prohibido: intentar acceso no autorizado al dashboard o API; automatizar scraping del sitio público; inyectar tráfico sintético a `/api/ingest` sin token válido (el rate limit y las medidas técnicas aplican); usar el sistema para monitorear redes de terceros sin autorización de sus dueños.
- El operador del agente es responsable de cumplir la normativa local aplicable al monitoreo de sus propias redes y de notificar a los usuarios de equipos monitoreados.

## 4. Estado del servicio (disclaimer)

- El software (v1) se provee "tal cual", sin garantías de inerrabilidad, exactitud de geolocalización o continuidad del análisis de IA (función con degradación elegida por diseño).
- El motor determinista local es la fuente de verdad de las alertas; el análisis de IA es asistencial y no reemplaza el criterio del operador.
- Strategic Connex no se responsabiliza por decisiones tomadas a partir de métricas o análisis del producto en v1.

## 5. Privacidad y limitación de responsabilidad

- Los datos procesados son agregados por diseño (ver `/legal/privacy`).
- En máxima extensión permitida por la ley aplicable, Strategic Connex no responde por daños indirectos, lucro cesante o pérdida de datos derivados del uso del servicio.
- La única pérdida de datos esperada y documentada del sistema es la FIFO del spool local (500 MB / 7 días), siempre reportada en la salud del agente.

## 6. Cambios

- Estos términos pueden actualizarse; la versión vigente se publica en `/legal/terms` con fecha.
- Cambios mayor de alcance funcional se comunican en las notas de release (CHANGELOG).

## 7. Contacto y jurisdicción

- Contacto: perfil de LinkedIn del responsable (ver `/contacto`).
- Ley aplicable y jurisdicción (Argentina): a definir por el revisor legal junto al domicilio de Strategic Connex.

---

**Pendientes antes de M3:**
- [x] Domicilio/socios/contacto oficial de Strategic Connex → decisión del equipo (nov 2026): titular "Strategic Connex" sin domicilio físico publicado; contacto exclusivamente por `/contacto`.
- [x] Jurisdicción y foro (Argentina) formulados por el revisor legal → Argentina; foro: Ciudad Autónoma de Buenos Aires.
- [ ] Formato de aceptación si el software se distribuye a terceros (post-v1) → fuera de alcance v1; reabrir si se licencia a terceros.
