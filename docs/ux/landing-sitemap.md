# UX — Sitemap de la landing (v1)

Fuente: spec §18.1. Framework: Next.js 15 App Router, grupo `(marketing)` público, SSG.

## Rutas

| Ruta | Grupo | Render | Hito | Nota |
|---|---|---|---|---|
| `/` | (marketing) | SSG | M3 | Home principal |
| `/funcionalidades` | (marketing) | SSG | M3 | Features detalladas |
| `/contacto` | (marketing) | SSG + form | M3 | Formulario con React Hook Form + Zod |
| `/legal/privacy` | (marketing) | MDX | M3 | `legal/privacy-policy-draft.md` pulido |
| `/legal/terms` | (marketing) | MDX | M3 | `legal/terms-draft.md` pulido |
| `/legal/third-party-notices` | (marketing) | MDX | M3 | Generado de `legal/THIRD_PARTY_NOTICES.md` |
| `/security` | (marketing) | SSG | M3 | Resumen de postura de seguridad |
| `/pricing` | (marketing) | — | v1.1 | En v1: CTA "Contactar ventas" en Home |
| `/docs` | (marketing) | — | v1.1 | Fuera de v1 |

## Secciones de la Home (arriba a abajo)

1. **Hero** — titular + subtitular + CTA principal + CTA secundario.
2. **Problema** — qué no ves hoy sobre tu red.
3. **Solución** — 3–4 cards de features (motor determinista local, señales agregadas, alertas explicadas, IA asistiendo).
4. **Cómo funciona** — 3 pasos (agente local → agregación → dashboard/IA).
5. **Arquitectura resumida** — diagrama simple (derivado de `diagrams/mermaid/system-context.mmd` simplificado).
6. **Privacidad** — "La nube recibe señales agregadas, no paquetes crudos" (réquiem de frontend: viene del mensaje clave de arriba).
7. **CTA secundario** — contacto / demo interna.
8. **Footer** — links legales + dominio corporativo.

## Mensaje clave (regla editorial)

> "Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos."

Aplicar el enfoque también al copy de `/funcionalidades` (todas las features se explican en función del principio del determinista-primero + IA como enriquecimiento por lotes).

## SEO básico

- Open Graph images en `public/og/`; metadata por ruta en las layouts.
- `sitemap.xml` + `robots.txt` para las rutas públicas solamente (el dashboard está excluido por robots y por auth).
- Sin tracking invasivo; analytics ligero (M3).
