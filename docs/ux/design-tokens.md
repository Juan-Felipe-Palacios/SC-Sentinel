# UX — Design tokens e identidad visual (v1)

**Fuente del sistema:** tokens de identidad de `strategicconnex.com.ar`, compartidos por landing y dashboard desde **un solo sistema en lib/** (decisión de diseño del spec). Styling: **Tailwind v4 CSS-first** — tokens como CSS variables en `globals.css` vía `@theme`; **sin** `tailwind.config.js`.

## Proceso de extracción

La extracción definitiva de valores (colores exactos, tipografía, logos) se hace en M3 desde el sitio corporativo, en este orden:

1. Inspección de CSS/render de strategicconnex.com.ar (color primario, secundario, fondos, texto, radios).
2. Logo principal/favicon en `public/` (SVG si hay; PNG/OG en `public/og/`).
3. Tipografía: la que use el sitio (o fallback del sistema si no es propietaria).
4. Fijar los valores en `web/app/globals.css` bajo `@theme` y revisar visual de landing+dashboard.

Hasta la extracción se usa un tema base neutral (oscuro, fonético) — estructura 100% definida ya, valores de marca swap-eables.

## Sistema de tokens (convención)

```css
/* globals.css (esqueleto v1) */
@theme {
  /* Marca */
  --sc-primary: <por extracción M3>;   /* acción/CTA */
  --sc-secondary: <por extracción M3>; /* acento secundario */

  /* Fondo y superficie */
  --sc-bg: #0b1220;
  --sc-surface: #111827;
  --sc-surface-alt: #1f2937;

  /* Texto */
  --sc-text: #e5e7eb;
  --sc-text-muted: #94a3b8;

  /* Estados/severidad (semánticos estables) */
  --sc-ok: #10b981;         /* verde */
  --sc-warn: #f59e0b;       /* ambar */
  --sc-risk-low: #22c55e;
  --sc-risk-medium: #eab308;
  --sc-risk-high: #f97316;
  --sc-risk-critical: #ef4444;
  --sc-degraded: #8b5cf6;   /* IA / modos degradados */

  /* Data-viz (gráficos bytes in/out, países) */
  --sc-chart-in: #38bdf8;   /* bytes in */
  --sc-chart-out: #a78bfa;  /* bytes out */

  /* Radios y tipografía */
  --sc-radius: 8px;
  --sc-font-sans: <font de marca o system-ui>;
  --sc-font-mono: ui-monospace, monospace;   /* datos/tablas/keys */
}
```

**Reglas:**

- Los valores semánticos (`--sc-ok`, riesgo, `--sc-data` viz) NO cambian con la extracción de marca; solo la capa de marca (primary/secondary/fondos/tipografía).
- El dashboard respeta la severidad del contrato de alertas: `info/low/medium/high/critical` ↔ tokens de riesgo arriba (mapa exacto documentado junto al componente Badge).
- Modo claro: basado con variables invertidas (mismo naming); v1 oscuro-first.

## Componentes base (shadcn/ui)

Se consumen `components/ui/*` (shadcn/Radix) mapeando `--sc-*` al theme de shadcn (HSL vars). Lucide para iconos; Recharts tomando los `--sc-chart-*` para consistencia entre landing y dashboard.
