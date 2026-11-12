# `web/` — Dashboard y landing de SC-Sentinel

Aplicación Next.js 15 (App Router) que sirve la landing pública, el dashboard de administración y la demo pública de solo lectura. La base de datos es PostgreSQL (Neon) y la ingesta llega desde el agente Rust.

## Stack

- Next.js 15.5 + React 19 + TypeScript
- Tailwind CSS 4
- Drizzle ORM + `@neondatabase/serverless`
- SWR para datos del dashboard
- Zod para validación de contratos
- Vitest para tests
- Recharts y `lucide-react` para visualización

## Requisitos

- Node.js 20+
- pnpm 9+
- Una base PostgreSQL/Neon accesible (o la URL de desarrollo que ya uses)

## Desarrollo local

```bash
cd web
pnpm install
cp .env.example .env.local
# completar las variables indicadas abajo
pnpm dev
```

Rutas principales:

| Ruta | Descripción |
|---|---|
| `/` | Landing pública |
| `/funcionalidades`, `/security`, `/contacto` | Páginas públicas de producto |
| `/legal/privacy`, `/legal/terms`, `/legal/third-party-notices` | Legales públicos (drafts en `docs/legal/`) |
| `/demo` | Entra a la demo pública de solo lectura (sin credenciales) |
| `/login` | Acceso de administración (panel de marca con show de drones) |
| `/p/[token]` | Trust Page pública por token (404 si expiró o fue revocado) |
| `/dashboard/overview` | Panel principal |
| `/dashboard/evals` | Observabilidad de AI Evals (coste, latencia, tasa de éxito) |
| `/dashboard/settings` | Configuración, solo administración |
| `/dashboard/admin/exports` | Auditoría de exports, solo administración |
| `/dashboard/admin/trust-access` | Accesos a Trust Pages, solo administración |

`/dashboard` sin sesión redirige automáticamente a `/demo`. La demo crea una cookie httpOnly `sc_guest` de 1 hora y muestra datos agregados del device configurado. Las acciones de escritura, la configuración y los tokens quedan bloqueados.

### Device de la demo

El device se resuelve en este orden:

1. `SC_GUEST_DEVICE_ID`
2. `DEFAULT_DEVICE_ID`
3. Primer device activo (o el primero no revocado)

Para producción conviene definir `SC_GUEST_DEVICE_ID` con un device de demostración dedicado.

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL/Neon |
| `SC_SESSION_SECRET` | Firma de cookies de sesión admin y demo |
| `ADMIN_SECRET` | Secreto administrativo para tooling/automatización |
| `CRON_SECRET` | Autorización de jobs cron |
| `NEXT_PUBLIC_APP_URL` | URL pública de la aplicación |
| `OPENROUTER_API_KEY` | Proveedor de IA (si se usa OpenRouter) |
| `AI_PROVIDER` | Proveedor de IA activo |
| `GEMINI_API_KEY` | Clave de Google Gemini (opcional) |
| `GROQ_API_KEY` | Clave de Groq (opcional) |
| `AI_MODELS` | Allowlist de modelos de IA |
| `DEFAULT_DEVICE_ID` | Device por defecto para la vista single-device |
| `SC_GUEST_DEVICE_ID` | Device expuesto en la demo pública (opcional) |
| `SC_INGEST_DEV_TOKEN` | Token de desarrollo para `/api/ingest`; nunca en producción |

No commitear `.env.local` ni `.env.production.local`. Los valores reales van en Vercel → Environment Variables.

## Scripts

```bash
pnpm dev         # next dev --turbopack
pnpm build       # build de producción
pnpm start       # servir el build
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest + contratos Zod
```

## Estructura

```text
app/
  (marketing)/      landing, funcionalidades, seguridad, contacto, legal
  (dashboard)/      layout protegido y páginas del panel
  api/              ingest, query, chat, auth, devices, ai
  demo/             entrada pública a la demo
components/
  marketing/        secciones de la landing
  dashboard/        sidebar, topbar, tarjetas, banner de demo
  chat/             widget de chat
lib/
  auth/             sesión admin, guest, resolución de roles
  query/            consultas a la base
  rate-limit/       límites de demo y login
  schemas/          validación Zod
```

## API

- `POST /api/ingest` — ingesta de snapshots del agente (token de device)
- `GET /api/query` — métricas del dashboard (admin o demo)
- `GET /api/alerts/[id]` — detalle de alerta con notas y auditoría (solo admin)
- `PATCH /api/alerts/[id]` — acknowledge, resolve, asignación y notas (solo admin)
- `POST /api/chat` — chat con RAG y streaming (admin o demo)
- `POST /api/auth/login` / `POST /api/auth/logout` — sesión admin
- `POST /api/auth/guest-login` — sesión de demo
- `POST /api/ai/analyze` — análisis por lotes (solo admin)
- `GET/POST /api/ai/cron` — job de análisis periódico (cron)
- `GET /api/chat/history` — historial del chat
- `GET /api/devices` — listado de devices (solo admin)
- `POST /api/devices/enroll` — alta de device (solo admin)
- `DELETE /api/devices/[id]` — baja de device (solo admin)
- `GET /api/export` y `GET /api/export/stats` — export CSV/XLSX con auditoría (solo admin)
- `POST /api/trust` y `GET /api/trust/access` — rotación/revocación de Trust Pages y su log de accesos
- `POST /api/cron/cleanup` — retención programada de datos

Los contratos están en `../docs/contracts/` y los tests de contrato corren con `pnpm test`.

## Verificación antes de desplegar

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

El build de producción se ejecuta en Vercel. La configuración de despliegue y las variables requeridas están en `../docs/release/deployment.md`.
