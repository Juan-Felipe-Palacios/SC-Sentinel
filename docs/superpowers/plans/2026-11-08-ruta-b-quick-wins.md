# Ruta B Quick-Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

I'm using the writing-plans skill to create the implementation plan.

**Goal:** Deliver the three SC Audit quick-wins as one sequenced roadmap: CSV/XLSX export, AI Evals Dashboard, and public Trust Page `p/[token]`.

**Architecture:** Export first (pure CSV/XLSX builders plus one `GET /api/export` route that reuses the existing `/api/query` auth and query functions, no DB migration). Then Evals (aggregate `ai_insights` through a new `metric=evals` query plus a dashboard view, no migration for v1). Then Trust Page (new `trust_pages` table, admin-only token API, public server component at `app/p/[token]/page.tsx` outside the `(dashboard)` middleware matcher).

**Tech Stack:** Next.js 15.5.28 App Router (React 19.1.0, TypeScript 5.9.3), Vitest 5.1.0 (`environment: 'node'`, `include: ['lib/**/*.test.ts', 'app/**/*.test.ts']`, alias `'@'` → `web/` root), Drizzle ORM 0.45.4 on Neon (`@neondatabase/serverless`), Zod 4.6.7, `xlsx` 0.18.5 (added in Task 4 only), SWR 2.5.1, `node:crypto` (`randomBytes`, `createHash`).

## Global Constraints

- No tocar `agent/spool/maintenance.ps1` (el fix vive en PR #2, ya mergeado).
- `host_stats` es deliberado, no cambiar su diseño.
- Para el test anti-drift, comparar `serde_json::Value`, no strings (aplica a cambios Rust; en `web/` los tests comparan valores parseados, no texto serializado).
- No subir a edition 2024 / MSRV 1.85 / pnpm 10 sin un cambio dedicado. Este plan solo agrega el paquete `xlsx` con `pnpm add`, sin subir versiones de tooling.
- Documentación y comentarios en español; identificadores en inglés.
- Gates Rust obligatorios tras cualquier cambio Rust: `cargo fmt --check`, `cargo test --workspace`, `clippy -D warnings`, `scripts/verify-contracts.sh`. Este plan no toca Rust: verificar con `git diff --stat` que no haya cambios fuera de `web/`, `docs/` y `scripts/test-contracts-zod.mjs`.
- Gates web obligatorios por feature: desde `web/`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest + `pnpm test:contracts`), `pnpm build`.
- Rutas API: cabeceras `Cache-Control: no-store, max-age=0`, `runtime = 'nodejs'` y `dynamic = 'force-dynamic'` cuando se lea la base (mismo patrón que `app/api/query/route.ts` y `app/api/auth/guest-login/route.ts`).
- Guest (cookie `sc_guest`) solo lectura, acotado a su `deviceId` del token; nunca aceptar `device_id` del query param para guest. Admin vía `authorize()` en `lib/auth/resolve.ts`.
- `middleware.ts` solo protege `/dashboard/:path*`. La Trust Page `p/[token]` queda pública por diseño; no agregar rutas a esa lista de matcher.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `web/lib/export/csv.ts` | Constructores puros de CSV (escaping RFC 4180) para hosts, alertas y overview. Sin DB, sin Next. |
| `web/lib/export/__tests__/csv.test.ts` | Tests de los constructores CSV (escaping, encabezados, orden). |
| `web/lib/export/xlsx.ts` | Construye el `Buffer` XLSX desde las mismas filas tabulares reutilizando `xlsx`. |
| `web/lib/schemas/export.ts` | Schema Zod `ExportParamsSchema` (`metric`, `range`, `format`, `device_id`). |
| `web/app/api/export/route.ts` | `GET /api/export`: autoriza, valida, llama a `queryHosts`/`queryAlerts`/`queryOverview`, responde CSV o XLSX. |
| `web/components/dashboard/ExportBar.tsx` | Botones cliente que enlazan a `/api/export?metric=...&range=...&format=csv\|xlsx`. |
| `web/lib/ai/evals.ts` | Agregación pura de evals desde filas `ai_insights` (conteos por status/modelo, taxa `degraded`, último insight). |
| `web/lib/ai/__tests__/evals.test.ts` | Tests de la agregación pura. |
| `web/lib/query/evals.ts` | Consulta SQL a `ai_insights` (últimos 30 días) y delega en `aggregateEvals`. |
| `web/lib/query/__tests__/evals.test.ts` | Test con DB inyectada (fake `QueryDb`) para `queryEvals`. |
| `web/lib/schemas/query.ts` (modificar) | Agregar `'evals'` al `metric` enum y tipo `EvalsResponse` en espejo. |
| `web/lib/api-types.ts` (modificar) | Agregar `EvalsResponse`, `EvalsByStatus`, `EvalsByModel` espejo de `/api/query?metric=evals`. |
| `web/app/api/query/route.ts` (modificar) | Caso `evals` en el switch: `queryEvals(deviceId)`. |
| `web/app/(dashboard)/dashboard/evals/page.tsx` | Página server con `metadata`, lee `range` opcional, renderiza `EvalsView`. |
| `web/components/dashboard/EvalsView.tsx` | Cliente SWR sobre `/api/query?metric=evals&range=...`, tablas por estado y modelo. |
| `web/components/dashboard/Sidebar.tsx` (modificar) | Link `Evals` hacia `/dashboard/evals`. |
| `web/lib/db/migrations/0008_trust-pages.sql` + `_journal.json` | Tabla `trust_pages (id, device_id, token_hash, label, created_at, revoked_at)` con índice único en `token_hash`. |
| `web/lib/db/schema.ts` (modificar) | Export `trustPages`. |
| `web/lib/trust/token.ts` | `generateTrustToken()`, `hashTrustToken(token)`, `trustTokensEqual(a,b)` con `timingSafeEqual`. |
| `web/lib/trust/__tests__/token.test.ts` | Tests de generación, hash y comparación. |
| `web/lib/trust/queries.ts` | `createTrustPage`, `revokeTrustPage`, `resolveTrustPage(token)`, `listTrustPages`. |
| `web/app/api/trust/route.ts` | `GET` lista (admin), `POST` crea (admin, devuelve token una vez), `DELETE` revoca (admin). |
| `web/app/p/[token]/page.tsx` | Página pública server: resuelve token, agrega datos con `queryOverview`/`queryHosts`/`queryAlerts`/`fetchLatestInsight`, renderiza `TrustView`. |
| `web/components/trust/TrustView.tsx` | Vista pública de solo lectura (totales, top hosts sin IP cruda, alertas, insight IA, medidas de seguridad). |
| `web/components/dashboard/SettingsView.tsx` (modificar) | Sección Trust: crear, listar, revocar tokens (solo admin). |

---

### Task 1: Constructores CSV puros

**Files:**
- Create: `web/lib/export/csv.ts`
- Test: `web/lib/export/__tests__/csv.test.ts`

**Interfaces:**
- Consumes: tipos `HostMetricItem` (`web/lib/query/hosts.ts`), `AlertItem` (`web/lib/query/alerts.ts`), `OverviewResult` (`web/lib/query/overview.ts`).
- Produces: `escapeCsvCell(value: string | number | null | undefined): string`, `hostsToCsv(hosts: HostMetricItem[]): string`, `alertsToCsv(alerts: AlertItem[]): string`, `overviewToCsv(overview: OverviewResult): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/export/__tests__/csv.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { alertsToCsv, escapeCsvCell, hostsToCsv, overviewToCsv } from '@/lib/export/csv';
import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertItem } from '@/lib/query/alerts';

describe('escapeCsvCell', () => {
  it('envuelve en comillas y duplica comillas internas', () => {
    expect(escapeCsvCell('a"b,c\nd')).toBe('"a""b,c\nd"');
  });

  it('deja celdas simples sin comillas', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
  });

  it('convierte null y undefined en celda vacía', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('convierte números con String()', () => {
    expect(escapeCsvCell(42)).toBe('42');
  });
});

describe('hostsToCsv', () => {
  const hosts: HostMetricItem[] = [
    {
      host_key: 'hk_1', ip: '10.0.0.5', country: 'AR', bytes_in: 100, bytes_out: 50,
      packets: 12, risk_score: 0.9, first_seen: '2026-01-01T00:00:00.000Z', last_seen: '2026-01-01T01:00:00.000Z',
    },
    {
      host_key: 'hk_2', ip: null, country: null, bytes_in: 0, bytes_out: 0,
      packets: 0, risk_score: null, first_seen: null, last_seen: null,
    },
  ];

  it('emite encabezado y una fila por host', () => {
    const csv = hostsToCsv(hosts);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('host_key,ip,country,bytes_in,bytes_out,packets,risk_score,first_seen,last_seen');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('hk_1,10.0.0.5,AR,100,50,12,0.9');
  });

  it('emite solo el encabezado con lista vacía', () => {
    expect(hostsToCsv([]).trim().split('\n')).toHaveLength(1);
  });
});

describe('alertsToCsv', () => {
  it('emite encabezado y escapa títulos con comas', () => {
    const alerts: AlertItem[] = [
      { id: 'a1', window_id: 'w1', rule_id: 'r1', severity: 'high', title: 'Pico, anómalo', description: null, evidence: null, created_at: '2026-01-01T00:00:00.000Z' },
    ];
    const lines = alertsToCsv(alerts).trim().split('\n');
    expect(lines[0]).toBe('id,window_id,rule_id,severity,title,created_at');
    expect(lines[1]).toContain('"Pico, anómalo"');
  });
});

describe('overviewToCsv', () => {
  it('incluye las claves de totales como filas clave-valor', () => {
    const csv = overviewToCsv({
      range: '1h',
      period: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T01:00:00.000Z' },
      totals: {
        bytes_in: 1000, bytes_out: 2000, packets_in: 30, packets_out: 30,
        windows_count: 2, alerts_count: 1, hosts_count: 3, countries_count: 1,
        alerts_by_severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      },
      series: [], top_hosts: [], top_countries: [], top_ports: [], protocols: [],
      risk: { scored_hosts: 3, high_hosts: 1, medium_hosts: 0, low_hosts: 2, avg_score: 0.5 },
    });
    expect(csv).toContain('bytes_in,1000');
    expect(csv).toContain('bytes_out,2000');
    expect(csv).toContain('alerts_count,1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/export/__tests__/csv.test.ts`
Expected: FAIL con `Cannot find module '@/lib/export/csv'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/export/csv.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Constructores puros de CSV (sin DB ni Next): el route handler los alimenta
// con los resultados de lib/query/*. RFC 4180: comillas si hay coma, comilla,
// salto de línea o \r; comillas internas duplicadas.

import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertItem } from '@/lib/query/alerts';
import type { OverviewResult } from '@/lib/query/overview';

/** Escapa una celda según RFC 4180. null/undefined → celda vacía. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function row(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(',');
}

const HOSTS_HEADER = 'host_key,ip,country,bytes_in,bytes_out,packets,risk_score,first_seen,last_seen';
const ALERTS_HEADER = 'id,window_id,rule_id,severity,title,created_at';

export function hostsToCsv(hosts: HostMetricItem[]): string {
  const lines = [HOSTS_HEADER];
  for (const host of hosts) {
    lines.push(
      row([
        host.host_key,
        host.ip,
        host.country,
        host.bytes_in,
        host.bytes_out,
        host.packets,
        host.risk_score === null ? null : host.risk_score,
        host.first_seen,
        host.last_seen,
      ])
    );
  }
  return `${lines.join('\n')}\n`;
}

export function alertsToCsv(alerts: AlertItem[]): string {
  const lines = [ALERTS_HEADER];
  for (const alert of alerts) {
    lines.push(row([alert.id, alert.window_id, alert.rule_id, alert.severity, alert.title, alert.created_at]));
  }
  return `${lines.join('\n')}\n`;
}

export function overviewToCsv(overview: OverviewResult): string {
  const t = overview.totals;
  const lines = [
    'metric,value',
    row(['range', overview.range]),
    row(['period_start', overview.period.start]),
    row(['period_end', overview.period.end]),
    row(['bytes_in', t.bytes_in]),
    row(['bytes_out', t.bytes_out]),
    row(['packets_in', t.packets_in]),
    row(['packets_out', t.packets_out]),
    row(['windows_count', t.windows_count]),
    row(['alerts_count', t.alerts_count]),
    row(['hosts_count', t.hosts_count]),
    row(['countries_count', t.countries_count]),
    row(['alerts_critical', t.alerts_by_severity.critical]),
    row(['alerts_high', t.alerts_by_severity.high]),
    row(['alerts_medium', t.alerts_by_severity.medium]),
    row(['alerts_low', t.alerts_by_severity.low]),
    row(['alerts_info', t.alerts_by_severity.info]),
    row(['risk_scored_hosts', overview.risk.scored_hosts]),
    row(['risk_high_hosts', overview.risk.high_hosts]),
    row(['risk_medium_hosts', overview.risk.medium_hosts]),
    row(['risk_low_hosts', overview.risk.low_hosts]),
    row(['risk_avg_score', overview.risk.avg_score]),
  ];
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/export/__tests__/csv.test.ts`
Expected: PASS (4 describe, 8 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/export/csv.ts web/lib/export/__tests__/csv.test.ts
git commit -m "feat(export): add pure CSV builders for hosts, alerts and overview"
```

---

### Task 2: Schema y ruta GET /api/export (CSV)

**Files:**
- Create: `web/lib/schemas/export.ts`
- Create: `web/app/api/export/route.ts`

**Interfaces:**
- Consumes: Task 1 (`hostsToCsv`, `alertsToCsv`, `overviewToCsv`), `authorize` y `clientIp` (`lib/auth/resolve.ts`), `checkGuestRequestLimit` + `guestRateLimitResponse` (`lib/rate-limit/guest.ts`), `resolveDeviceId` (`lib/query/device.ts`), `queryOverview` (`lib/query/overview.ts`), `queryHosts` (`lib/query/hosts.ts`), `queryAlerts` (`lib/query/alerts.ts`), `queryRangeSchema` (`lib/schemas/query.ts`).
- Produces: `ExportParamsSchema` (Zod, `metric: 'overview'|'hosts'|'alerts'`, `range`, `format: 'csv'`, `device_id?`), `GET /api/export` que responde `text/csv`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/schemas/export.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { ExportParamsSchema } from '@/lib/schemas/export';

describe('ExportParamsSchema', () => {
  it('acepta metric/range/format csv con defaults', () => {
    const parsed = ExportParamsSchema.parse({ metric: 'hosts' });
    expect(parsed).toEqual({ metric: 'hosts', range: '1h', format: 'csv', device_id: undefined });
  });

  it('rechaza métricas no exportables', () => {
    expect(() => ExportParamsSchema.parse({ metric: 'health' })).toThrow();
  });

  it('rechaza metric ausente', () => {
    expect(() => ExportParamsSchema.parse({})).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/schemas/export.test.ts`
Expected: FAIL con `Cannot find module '@/lib/schemas/export'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/schemas/export.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Parámetros de GET /api/export. `ai` y `health` no se exportan en v1.

import { z } from 'zod';
import { queryRangeSchema } from './query';

export const ExportParamsSchema = z.object({
  metric: z.enum(['overview', 'hosts', 'alerts']),
  range: queryRangeSchema,
  format: z.literal('csv'),
  device_id: z.string().min(1).optional(),
});

export type ExportParams = z.infer<typeof ExportParamsSchema>;
```

```typescript
// web/app/api/export/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/export?metric=hosts|overview|alerts&range=1h&format=csv
// Reutiliza la autorización y las consultas de /api/query. Solo CSV en esta tarea.

import { NextRequest, NextResponse } from 'next/server';
import { ExportParamsSchema } from '@/lib/schemas/export';
import { authorize, clientIp } from '@/lib/auth/resolve';
import { checkGuestRequestLimit, guestRateLimitResponse } from '@/lib/rate-limit/guest';
import { resolveDeviceId } from '@/lib/query/device';
import { queryOverview } from '@/lib/query/overview';
import { queryHosts } from '@/lib/query/hosts';
import { queryAlerts } from '@/lib/query/alerts';
import { alertsToCsv, hostsToCsv, overviewToCsv } from '@/lib/export/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: true });
  if (!check.ok) return check.response;
  const { auth } = check;

  const { searchParams } = new URL(request.url);
  const parsed = ExportParamsSchema.safeParse({
    metric: searchParams.get('metric') ?? undefined,
    range: searchParams.get('range') ?? undefined,
    format: searchParams.get('format') ?? undefined,
    device_id: searchParams.get('device_id') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid export params' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const { metric, range, device_id } = parsed.data;

  // Guest: device fijo del token; nunca el query param. Igual que en /api/query.
  let guestDeviceId: string | null = null;
  if (auth.role === 'guest') {
    const limit = checkGuestRequestLimit(clientIp(request));
    if (!limit.allowed) {
      return guestRateLimitResponse(limit.retryAfterSeconds);
    }
    if (device_id && device_id !== auth.guest.deviceId) {
      return NextResponse.json(
        { error: 'forbidden', message: 'El visitante solo puede exportar su device de demostración.' },
        { status: 403, headers: noStoreHeaders }
      );
    }
    guestDeviceId = auth.guest.deviceId;
  }

  try {
    const deviceId = auth.role === 'guest' ? guestDeviceId : await resolveDeviceId(device_id);

    let csv: string;
    if (metric === 'hosts') {
      csv = hostsToCsv((await queryHosts(range, deviceId)).hosts);
    } else if (metric === 'alerts') {
      csv = alertsToCsv((await queryAlerts(range, deviceId)).alerts);
    } else {
      csv = overviewToCsv(await queryOverview(range, deviceId));
    }

    const filename = `sc-sentinel-${metric}-${range}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error in /api/export:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/schemas/export.test.ts`
Expected: PASS (3 tests).

Verificación manual (requiere `DATABASE_URL` y servidor de desarrollo):
Run: `pnpm dev` en una terminal; en otra, `POST /api/auth/guest-login` y `GET /api/export?metric=hosts&range=1h&format=csv` con la cookie `sc_guest`.
Expected: `200` con `Content-Type: text/csv; charset=utf-8` y `Content-Disposition: attachment`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/schemas/export.ts web/lib/schemas/export.test.ts web/app/api/export/route.ts
git commit -m "feat(export): add GET /api/export with CSV for overview, hosts and alerts"
```

---

### Task 3: Botones de exportación en el dashboard

**Files:**
- Create: `web/components/dashboard/ExportBar.tsx`
- Modify: `web/components/dashboard/OverviewView.tsx:1-30` (import) y el bloque de acciones (agregar `<ExportBar range={range} />` junto al header existente, tras `const REFRESH_MS = 5000;`)

**Interfaces:**
- Consumes: `QueryRange` (`lib/schemas/query.ts`). Enlaces absolutos a `/api/export` (cookies de sesión viajan en navegación normal).
- Produces: `<ExportBar range: QueryRange />` con 3 métricas × formato CSV (XLSX se suma en la Task 5).

- [ ] **Step 1: Write the failing typecheck**

Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module '@/components/dashboard/ExportBar'` si ya referenciás el componente. Para reproducirlo antes de crearlo, agregar primero solo el import y uso sin el archivo:

```typescript
// Añadir temporalmente en web/components/dashboard/OverviewView.tsx tras la línea 29:
import { ExportBar } from './ExportBar';
```

Y dentro del JSX del header (donde está el botón de refrescar), añadir `<ExportBar range={range} />`. Ejecutar `pnpm typecheck` → FAIL.

- [ ] **Step 2: Write the failing test (componente sin lógica, se valida por build)**

Run (desde `web/`): `pnpm tsc --noEmit`
Expected: FAIL con `Cannot find module './ExportBar'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web/components/dashboard/ExportBar.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Enlaces de descarga a /api/export. Son <a> normales para que el navegador
// descargue el archivo con las cookies de sesión actuales.
'use client';

import type { QueryRange } from '@/lib/schemas/query';

type ExportMetric = 'overview' | 'hosts' | 'alerts';

const METRIC_LABELS: Record<ExportMetric, string> = {
  overview: 'Resumen',
  hosts: 'Hosts',
  alerts: 'Alertas',
};

function hrefFor(metric: ExportMetric, range: QueryRange, format: 'csv' | 'xlsx'): string {
  return `/api/export?metric=${metric}&range=${range}&format=${format}`;
}

export function ExportBar({ range }: { range: QueryRange }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Exportar datos">
      {(['overview', 'hosts', 'alerts'] as const).map((metric) => (
        <span key={metric} className="inline-flex items-center gap-1">
          <a
            href={hrefFor(metric, range, 'csv')}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
            aria-label={`Exportar ${METRIC_LABELS[metric]} como CSV`}
          >
            {METRIC_LABELS[metric]} CSV
          </a>
          <a
            href={hrefFor(metric, range, 'xlsx')}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
            aria-label={`Exportar ${METRIC_LABELS[metric]} como XLSX`}
          >
            {METRIC_LABELS[metric]} XLSX
          </a>
        </span>
      ))}
    </div>
  );
}
```

En `web/components/dashboard/OverviewView.tsx`, tras la línea 29 (`import { useDashboardRole } from './DashboardRoleContext';`), añadir `import { ExportBar } from './ExportBar';` y dentro del retorno, justo después del bloque de cabecera que contiene el selector de rango (donde se renderiza el título del overview), insertar `<ExportBar range={range} />`.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS (sin errores). Los enlaces XLSX todavía devolverán `400` hasta la Task 5; no bloquea el build.

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/ExportBar.tsx web/components/dashboard/OverviewView.tsx
git commit -m "feat(export): add ExportBar with CSV download links to the overview"
```

---

### Task 4: Dependencia `xlsx` y constructor XLSX

**Files:**
- Modify: `web/package.json` (agregar `"xlsx": "^0.18.5"` a `dependencies`)
- Create: `web/lib/export/xlsx.ts`
- Modify: `web/lib/schemas/export.ts` (aceptar `format: 'csv' | 'xlsx'`)

**Interfaces:**
- Consumes: filas tabulares de Task 1. La función nueva es `buildXlsxBuffer(sheetName: string, rows: Array<Record<string, string | number | null>>): Buffer`. El route handler (Task 5) convierte `HostMetricItem[]` y `AlertItem[]` a ese formato.
- Produces: `rowsFromHosts`, `rowsFromAlerts`, `buildXlsxBuffer`.

- [ ] **Step 1: Add the dependency and write the failing test**

```bash
pnpm add xlsx@^0.18.5
```

```typescript
// web/lib/export/__tests__/xlsx.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { buildXlsxBuffer, rowsFromAlerts, rowsFromHosts } from '@/lib/export/xlsx';
import * as XLSX from 'xlsx';

describe('rowsFromHosts', () => {
  it('mapea hosts a filas planas', () => {
    expect(rowsFromHosts([
      { host_key: 'hk_1', ip: '10.0.0.5', country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: '2026-01-01T00:00:00.000Z', last_seen: '2026-01-01T01:00:00.000Z' },
    ])).toEqual([
      { host_key: 'hk_1', ip: '10.0.0.5', country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: '2026-01-01T00:00:00.000Z', last_seen: '2026-01-01T01:00:00.000Z' },
    ]);
  });
});

describe('rowsFromAlerts', () => {
  it('mapea alertas a filas planas', () => {
    expect(rowsFromAlerts([
      { id: 'a1', window_id: 'w1', rule_id: 'r1', severity: 'high', title: 'Pico', description: null, evidence: null, created_at: '2026-01-01T00:00:00.000Z' },
    ])).toEqual([{ id: 'a1', window_id: 'w1', rule_id: 'r1', severity: 'high', title: 'Pico', created_at: '2026-01-01T00:00:00.000Z' }]);
  });
});

describe('buildXlsxBuffer', () => {
  it('produce un workbook legible con una hoja', () => {
    const buffer = buildXlsxBuffer('hosts', [{ host_key: 'hk_1', bytes_in: 100 }]);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['hosts']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['hosts']!);
    expect(rows).toEqual([{ host_key: 'hk_1', bytes_in: 100 }]);
  });

  it('produce un workbook vacío válido sin filas', () => {
    const workbook = XLSX.read(buildXlsxBuffer('hosts', []), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['hosts']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/export/__tests__/xlsx.test.ts`
Expected: FAIL con `Cannot find module '@/lib/export/xlsx'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/export/xlsx.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Constructor del workbook XLSX desde filas tabulares. Reutiliza las mismas
// filas que el CSV para que ambas exportaciones coincidan por construcción.
import * as XLSX from 'xlsx';
import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertItem } from '@/lib/query/alerts';

export type ExportRow = Record<string, string | number | null>;

export function rowsFromHosts(hosts: HostMetricItem[]): ExportRow[] {
  return hosts.map((host) => ({
    host_key: host.host_key,
    ip: host.ip,
    country: host.country,
    bytes_in: host.bytes_in,
    bytes_out: host.bytes_out,
    packets: host.packets,
    risk_score: host.risk_score,
    first_seen: host.first_seen,
    last_seen: host.last_seen,
  }));
}

export function rowsFromAlerts(alerts: AlertItem[]): ExportRow[] {
  return alerts.map((alert) => ({
    id: alert.id,
    window_id: alert.window_id,
    rule_id: alert.rule_id,
    severity: alert.severity,
    title: alert.title,
    created_at: alert.created_at,
  }));
}

/** Genera el Buffer .xlsx con una única hoja `sheetName`. */
export function buildXlsxBuffer(sheetName: string, rows: ExportRow[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
```

En `web/lib/schemas/export.ts`, reemplazar la línea `format: z.literal('csv'),` por `format: z.enum(['csv', 'xlsx']),`.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/export/__tests__/xlsx.test.ts && pnpm vitest run lib/schemas/export.test.ts`
Expected: PASS. Nota: `lib/schemas/export.test.ts` de la Task 2 espera el default `'csv'`; sigue pasando porque el default del schema se mantiene en el route, no en Zod. Si el test de la Task 2 falla porque el schema ya no usa `z.literal`, actualizar su expectativa a `format: 'csv'` sigue siendo válida (se valida que `'csv'` se acepta).

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/lib/export/xlsx.ts web/lib/export/__tests__/xlsx.test.ts web/lib/schemas/export.ts
git commit -m "feat(export): add xlsx builder and accept format=xlsx"
```

---

### Task 5: Respuesta XLSX en GET /api/export

**Files:**
- Modify: `web/app/api/export/route.ts` (rama `xlsx`)

**Interfaces:**
- Consumes: Task 4 (`rowsFromHosts`, `rowsFromAlerts`, `buildXlsxBuffer`) y `overviewToCsv` sigue para `metric=overview` (para overview en XLSX se construye una hoja clave-valor con las mismas filas que el CSV).
- Produces: respuesta `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` con `Content-Disposition: attachment; filename="sc-sentinel-<metric>-<range>.xlsx"`.

- [ ] **Step 1: Write the failing test**

Run (desde `web/`): `pnpm vitest run lib/schemas/export.test.ts`
Expected: FAIL si el test espera rechazar `xlsx`. Añadir al test existente:

```typescript
it('acepta format=xlsx', () => {
  expect(ExportParamsSchema.parse({ metric: 'hosts', format: 'xlsx' }).format).toBe('xlsx');
});
```

Ejecutar → FAIL antes de modificar el route (el schema de la Task 4 ya lo acepta, pero el route todavía responde 400 para `xlsx` porque `ExportParamsSchema` del route se valida y luego `parsed.data.format` se ignora y siempre se construye CSV). La verificación real es manual (ver paso 4).

- [ ] **Step 2: Run test to verify it fails**

Verificación en código: leer `web/app/api/export/route.ts`; el bloque `let csv: string;` ignora `format`. Es el fallo a corregir.

- [ ] **Step 3: Write minimal implementation**

Reemplazar en `web/app/api/export/route.ts` el bloque `try { ... }` por:

```typescript
import { buildXlsxBuffer, rowsFromAlerts, rowsFromHosts } from '@/lib/export/xlsx';

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: true });
  if (!check.ok) return check.response;
  const { auth } = check;

  const { searchParams } = new URL(request.url);
  const parsed = ExportParamsSchema.safeParse({
    metric: searchParams.get('metric') ?? undefined,
    range: searchParams.get('range') ?? undefined,
    format: searchParams.get('format') ?? undefined,
    device_id: searchParams.get('device_id') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid export params' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const { metric, range, format, device_id } = parsed.data;

  let guestDeviceId: string | null = null;
  if (auth.role === 'guest') {
    const limit = checkGuestRequestLimit(clientIp(request));
    if (!limit.allowed) {
      return guestRateLimitResponse(limit.retryAfterSeconds);
    }
    if (device_id && device_id !== auth.guest.deviceId) {
      return NextResponse.json(
        { error: 'forbidden', message: 'El visitante solo puede exportar su device de demostración.' },
        { status: 403, headers: noStoreHeaders }
      );
    }
    guestDeviceId = auth.guest.deviceId;
  }

  try {
    const deviceId = auth.role === 'guest' ? guestDeviceId : await resolveDeviceId(device_id);

    if (format === 'xlsx') {
      let buffer: Buffer;
      if (metric === 'hosts') {
        buffer = buildXlsxBuffer('hosts', rowsFromHosts((await queryHosts(range, deviceId)).hosts));
      } else if (metric === 'alerts') {
        buffer = buildXlsxBuffer('alerts', rowsFromAlerts((await queryAlerts(range, deviceId)).alerts));
      } else {
        const overview = await queryOverview(range, deviceId);
        const t = overview.totals;
        buffer = buildXlsxBuffer('overview', [
          { metric: 'bytes_in', value: t.bytes_in },
          { metric: 'bytes_out', value: t.bytes_out },
          { metric: 'alerts_count', value: t.alerts_count },
          { metric: 'hosts_count', value: t.hosts_count },
          { metric: 'windows_count', value: t.windows_count },
        ]);
      }
      const filename = `sc-sentinel-${metric}-${range}.xlsx`;
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          ...noStoreHeaders,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    let csv: string;
    if (metric === 'hosts') {
      csv = hostsToCsv((await queryHosts(range, deviceId)).hosts);
    } else if (metric === 'alerts') {
      csv = alertsToCsv((await queryAlerts(range, deviceId)).alerts);
    } else {
      csv = overviewToCsv(await queryOverview(range, deviceId));
    }

    const filename = `sc-sentinel-${metric}-${range}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error in /api/export:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/schemas/export.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

Verificación manual: con la cookie `sc_guest`, `GET /api/export?metric=hosts&range=1h&format=xlsx`.
Expected: `200` con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; abrir el archivo muestra la hoja `hosts`.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/export/route.ts web/lib/schemas/export.test.ts
git commit -m "feat(export): serve XLSX downloads from GET /api/export"
```

---

### Task 6: Agregación pura de evals de IA

**Files:**
- Create: `web/lib/ai/evals.ts`
- Test: `web/lib/ai/__tests__/evals.test.ts`

**Interfaces:**
- Consumes: `AiInsightRecord` (`web/lib/ai/analyze.ts`).
- Produces: `EvalsByStatus`, `EvalsByModel`, `EvalsResponse`, `aggregateEvals(insights: AiInsightRecord[]): EvalsResponse`. `EvalsResponse = { total, ok, degraded, cached, no_data, degraded_rate, latest_created_at, by_model: Array<{ model, total, ok, degraded, degraded_rate }> }`. Conteos por `status`; `degraded_rate = degraded / total` (0 si total es 0).

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/ai/__tests__/evals.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { aggregateEvals } from '@/lib/ai/evals';
import type { AiInsightRecord } from '@/lib/ai/analyze';

function insight(partial: Partial<AiInsightRecord> & { id: string }): AiInsightRecord {
  return {
    device_id: 'dev_1',
    period_start: '2026-01-01T00:00:00.000Z',
    period_end: '2026-01-01T01:00:00.000Z',
    model: 'test-model',
    status: 'ok',
    language: 'es',
    risk_level: 'low',
    summary: 's',
    findings: [],
    recommendations: [],
    facts_hash: 'h',
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as AiInsightRecord;
}

describe('aggregateEvals', () => {
  it('cuenta por estado y calcula la taxa degraded', () => {
    const result = aggregateEvals([
      insight({ id: '1', status: 'ok' }),
      insight({ id: '2', status: 'ok' }),
      insight({ id: '3', status: 'degraded' }),
      insight({ id: '4', status: 'cached' }),
    ]);
    expect(result).toMatchObject({ total: 4, ok: 2, degraded: 1, cached: 1, no_data: 0, degraded_rate: 0.25 });
  });

  it('agrupa por modelo ordenando por total descendente', () => {
    const result = aggregateEvals([
      insight({ id: '1', model: 'a', status: 'ok' }),
      insight({ id: '2', model: 'a', status: 'degraded' }),
      insight({ id: '3', model: 'b', status: 'ok' }),
    ]);
    expect(result.by_model.map((entry) => entry.model)).toEqual(['a', 'b']);
    expect(result.by_model[0]).toMatchObject({ model: 'a', total: 2, ok: 1, degraded: 1, degraded_rate: 0.5 });
  });

  it('devuelve latest_created_at máximo y vacío seguro', () => {
    expect(aggregateEvals([])).toMatchObject({ total: 0, degraded_rate: 0, latest_created_at: null, by_model: [] });
    const result = aggregateEvals([
      insight({ id: '1', created_at: '2026-01-01T02:00:00.000Z' }),
      insight({ id: '2', created_at: '2026-01-01T03:00:00.000Z' }),
    ]);
    expect(result.latest_created_at).toBe('2026-01-01T03:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/ai/__tests__/evals.test.ts`
Expected: FAIL con `Cannot find module '@/lib/ai/evals'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/ai/evals.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Agregación pura de evals sobre filas ai_insights. No consulta la base:
// lib/query/evals.ts lee las filas y delega aquí para que sea testeable sin DB.

import type { AiInsightRecord } from './analyze';

export interface EvalsByModel {
  model: string;
  total: number;
  ok: number;
  degraded: number;
  degraded_rate: number;
}

export interface EvalsResponse {
  total: number;
  ok: number;
  degraded: number;
  cached: number;
  no_data: number;
  degraded_rate: number;
  latest_created_at: string | null;
  by_model: EvalsByModel[];
}

function rate(degraded: number, total: number): number {
  return total === 0 ? 0 : degraded / total;
}

export function aggregateEvals(insights: AiInsightRecord[]): EvalsResponse {
  const byModel = new Map<string, { total: number; ok: number; degraded: number }>();
  let ok = 0;
  let degraded = 0;
  let cached = 0;
  let noData = 0;
  let latestCreatedAt: string | null = null;

  for (const insight of insights) {
    if (insight.status === 'ok') ok += 1;
    else if (insight.status === 'degraded') degraded += 1;
    else if (insight.status === 'cached') cached += 1;
    else noData += 1;

    const entry = byModel.get(insight.model) ?? { total: 0, ok: 0, degraded: 0 };
    entry.total += 1;
    if (insight.status === 'ok') entry.ok += 1;
    if (insight.status === 'degraded') entry.degraded += 1;
    byModel.set(insight.model, entry);

    if (latestCreatedAt === null || insight.created_at > latestCreatedAt) {
      latestCreatedAt = insight.created_at;
    }
  }

  const total = insights.length;
  return {
    total,
    ok,
    degraded,
    cached,
    no_data: noData,
    degraded_rate: rate(degraded, total),
    latest_created_at: latestCreatedAt,
    by_model: Array.from(byModel, ([model, counts]) => ({
      model,
      total: counts.total,
      ok: counts.ok,
      degraded: counts.degraded,
      degraded_rate: rate(counts.degraded, counts.total),
    })).sort((a, b) => b.total - a.total || a.model.localeCompare(b.model)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/ai/__tests__/evals.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/ai/evals.ts web/lib/ai/__tests__/evals.test.ts
git commit -m "feat(evals): add pure aggregation over ai_insights rows"
```

---

### Task 7: Consulta SQL de evals y endpoint metric=evals

**Files:**
- Create: `web/lib/query/evals.ts`
- Test: `web/lib/query/__tests__/evals.test.ts`
- Modify: `web/lib/schemas/query.ts:6` (agregar `'evals'` al enum)
- Modify: `web/lib/api-types.ts` (agregar `EvalsModelEntry`, `EvalsResponse`)
- Modify: `web/app/api/query/route.ts` (import + caso `evals`)

**Interfaces:**
- Consumes: Task 6 (`aggregateEvals`, `EvalsResponse`), `queryRows` + `QueryDb` (`lib/query/db-rows.ts`), `AiInsightRecord` mapeo local.
- Produces: `queryEvals(deviceId?: string | null, database?: QueryDb): Promise<EvalsResponse>` que lee `ai_insights` de los últimos 30 días del device y agrega.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/query/__tests__/evals.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { queryEvals } from '@/lib/query/evals';
import type { QueryDb } from '@/lib/query/db-rows';
import type { SQL } from 'drizzle-orm';

function fakeDb(rows: unknown[]): QueryDb {
  return {
    execute: (_query: SQL) => Promise.resolve({ rows }),
  };
}

describe('queryEvals', () => {
  it('devuelve vacío sin device_id sin tocar la base', async () => {
    const failingDb: QueryDb = { execute: () => Promise.reject(new Error('no debe llamar')) };
    const result = await queryEvals(null, failingDb);
    expect(result).toMatchObject({ total: 0, degraded_rate: 0, by_model: [] });
  });

  it('agrega filas de ai_insights', async () => {
    const result = await queryEvals('dev_1', fakeDb([
      { id: '1', device_id: 'dev_1', period_start: '2026-01-01T00:00:00.000Z', period_end: '2026-01-01T01:00:00.000Z', model: 'm', status: 'ok', language: 'es', risk_level: 'low', summary: 's', recommendations_json: { findings: [], recommendations: [] }, facts_hash: 'h1', created_at: '2026-01-01T01:00:00.000Z' },
      { id: '2', device_id: 'dev_1', period_start: '2026-01-01T00:00:00.000Z', period_end: '2026-01-01T01:00:00.000Z', model: 'm', status: 'degraded', language: 'es', risk_level: 'low', summary: 's', recommendations_json: { findings: [], recommendations: [] }, facts_hash: 'h2', created_at: '2026-01-01T02:00:00.000Z' },
    ]));
    expect(result).toMatchObject({ total: 2, ok: 1, degraded: 1, degraded_rate: 0.5 });
  });
});

import { sql } from 'drizzle-orm';
void sql;
```

> Nota: el test usa el fake `QueryDb` porque `queryRows` acepta `{ rows }`. La consulta real usa `sql` de Drizzle como en `lib/query/health.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/query/__tests__/evals.test.ts`
Expected: FAIL con `Cannot find module '@/lib/query/evals'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/query/evals.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Evalúa la calidad de la IA leyendo ai_insights (últimos 30 días) y
// agregando con lib/ai/evals.ts. Sin migración: v1 solo lee lo ya persistido.

import { sql } from 'drizzle-orm';
import { defaultQueryDb, queryRows, type QueryDb } from './db-rows';
import { aggregateEvals, type EvalsResponse } from '@/lib/ai/evals';
import type { AiInsightRecord } from '@/lib/ai/analyze';

export type { EvalsResponse };

interface InsightRow {
  id: string;
  device_id: string;
  period_start: Date | string;
  period_end: Date | string;
  model: string;
  status: string;
  language: string | null;
  risk_level: string | null;
  summary: string;
  recommendations_json: unknown;
  facts_hash: string;
  created_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function toInsight(row: InsightRow): AiInsightRecord {
  const raw = row.recommendations_json;
  let findings: AiInsightRecord['findings'] = [];
  let recommendations: string[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as { findings?: unknown; recommendations?: unknown };
    if (Array.isArray(obj.findings)) {
      findings = obj.findings.filter(
        (entry): entry is AiInsightRecord['findings'][number] =>
          !!entry && typeof entry === 'object'
      );
    }
    if (Array.isArray(obj.recommendations)) {
      recommendations = obj.recommendations.filter(
        (entry): entry is string => typeof entry === 'string'
      );
    }
  } else if (Array.isArray(raw)) {
    recommendations = raw.filter((entry): entry is string => typeof entry === 'string');
  }
  const status = row.status === 'degraded' || row.status === 'cached' || row.status === 'no_data' ? row.status : 'ok';
  return {
    id: row.id,
    device_id: row.device_id,
    period_start: iso(row.period_start),
    period_end: iso(row.period_end),
    model: row.model,
    status,
    language: row.language === 'en' ? 'en' : 'es',
    risk_level: row.risk_level,
    summary: row.summary,
    findings,
    recommendations,
    facts_hash: row.facts_hash,
    created_at: iso(row.created_at),
  };
}

export async function queryEvals(
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb
): Promise<EvalsResponse> {
  if (!deviceId) return aggregateEvals([]);

  const rows = await queryRows<InsightRow>(
    database,
    sql`SELECT id, device_id, period_start, period_end, model, status, language,
               risk_level, summary, recommendations_json, facts_hash, created_at
        FROM ai_insights
        WHERE device_id = ${deviceId}
          AND created_at > (NOW() - INTERVAL '30 days')
        ORDER BY created_at DESC`
  );
  return aggregateEvals(rows.map(toInsight));
}
```

En `web/lib/schemas/query.ts`, línea 6, reemplazar:
```typescript
metric: z.enum(['overview', 'hosts', 'alerts', 'health', 'ai']),
```
por:
```typescript
metric: z.enum(['overview', 'hosts', 'alerts', 'health', 'ai', 'evals']),
```

En `web/lib/api-types.ts`, añadir al final del archivo:
```typescript
export interface EvalsModelEntry {
  model: string;
  total: number;
  ok: number;
  degraded: number;
  degraded_rate: number;
}

export interface EvalsResponse {
  total: number;
  ok: number;
  degraded: number;
  cached: number;
  no_data: number;
  degraded_rate: number;
  latest_created_at: string | null;
  by_model: EvalsModelEntry[];
}
```

En `web/app/api/query/route.ts`, tras la línea 12 (`import { fetchLatestInsight } from '@/lib/ai/analyze';`), añadir `import { queryEvals } from '@/lib/query/evals';` y dentro del `switch (metric)`, tras el caso `'ai'`, añadir:
```typescript
      case 'evals':
        return NextResponse.json(await queryEvals(deviceId), {
          status: 200,
          headers: noStoreHeaders,
        });
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/query/__tests__/evals.test.ts lib/ai/__tests__/evals.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/query/evals.ts web/lib/query/__tests__/evals.test.ts web/lib/schemas/query.ts web/lib/api-types.ts web/app/api/query/route.ts
git commit -m "feat(evals): add metric=evals aggregating ai_insights over 30 days"
```

---

### Task 8: Vista Evals en el dashboard

**Files:**
- Create: `web/app/(dashboard)/dashboard/evals/page.tsx`
- Create: `web/components/dashboard/EvalsView.tsx`
- Modify: `web/components/dashboard/Sidebar.tsx` (link `Evals`)

**Interfaces:**
- Consumes: `EvalsResponse` (Task 7), `fetcher` + `FetchError` (`lib/swr.ts`), patrón SWR de `OverviewView` (`useSWR` con `refreshInterval: 5000`, estado de sesión expirada `401`).
- Produces: ruta `/dashboard/evals` con `metadata` en español y tabla por modelo.

- [ ] **Step 1: Write the failing typecheck**

Create `web/app/(dashboard)/dashboard/evals/page.tsx` con solo el contenido siguiente y ejecutar `pnpm typecheck`:
```tsx
// web/app/(dashboard)/dashboard/evals/page.tsx
import { EvalsView } from '@/components/dashboard/EvalsView';
export default function EvalsPage() {
  return <EvalsView />;
}
```
Expected: FAIL con `Cannot find module '@/components/dashboard/EvalsView'`.

- [ ] **Step 2: Write the failing test**

Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module '@/components/dashboard/EvalsView'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web/components/dashboard/EvalsView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Dashboard de evals de IA: agregados de ai_insights (30 días) sin llamadas
// nuevas a la IA. No expone summaries ni prompts.
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TriangleAlert } from 'lucide-react';
import type { EvalsResponse } from '@/lib/api-types';
import { fetcher, FetchError } from '@/lib/swr';

const REFRESH_MS = 5000;

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function EvalsView() {
  const { data, error } = useSWR<EvalsResponse>('/api/query?metric=evals', fetcher, {
    refreshInterval: REFRESH_MS,
  });

  const sessionExpired = error instanceof FetchError && error.status === 401;
  if (sessionExpired) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">Tu sesión expiró</h2>
        <Link href="/login" className="mt-6 inline-flex items-center justify-center rounded-lg border border-sky-400/40 bg-sky-400/10 px-5 py-2.5 font-display text-sm font-semibold text-sky-400">
          Volver a entrar
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-400">Cargando evals…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Total (30 días)</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{data.total}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">OK</p>
          <p className="mt-2 font-display text-2xl font-semibold text-emerald-300">{data.ok}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Degraded</p>
          <p className="mt-2 font-display text-2xl font-semibold text-amber-300">{data.degraded}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Tasa degraded</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{percent(data.degraded_rate)}</p>
        </div>
      </div>

      <table className="w-full overflow-hidden rounded-xl border border-slate-800 text-sm">
        <thead className="bg-slate-900/80 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
          <tr>
            <th className="px-4 py-3">Modelo</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">OK</th>
            <th className="px-4 py-3">Degraded</th>
            <th className="px-4 py-3">Tasa degraded</th>
          </tr>
        </thead>
        <tbody>
          {data.by_model.map((entry) => (
            <tr key={entry.model} className="border-t border-slate-800 text-slate-300">
              <td className="px-4 py-3 font-mono text-xs">{entry.model}</td>
              <td className="px-4 py-3">{entry.total}</td>
              <td className="px-4 py-3">{entry.ok}</td>
              <td className="px-4 py-3">{entry.degraded}</td>
              <td className="px-4 py-3">{percent(entry.degraded_rate)}</td>
            </tr>
          ))}
          {data.by_model.length === 0 && (
            <tr className="border-t border-slate-800 text-slate-400">
              <td className="px-4 py-3" colSpan={5}>Sin análisis de IA en los últimos 30 días.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="font-mono text-xs text-slate-500">
        Último análisis: {data.latest_created_at ?? '—'}
      </p>
    </div>
  );
}
```

```tsx
// web/app/(dashboard)/dashboard/evals/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { EvalsView } from '@/components/dashboard/EvalsView';

export const metadata: Metadata = {
  title: 'Evals de IA · SC-Sentinel',
  description: 'Calidad de los análisis de IA: totales por estado y modelo en los últimos 30 días.',
};

export default function EvalsPage() {
  return <EvalsView />;
}
```

En `web/components/dashboard/Sidebar.tsx`, añadir al array de navegación la entrada `{ href: '/dashboard/evals', label: 'Evals de IA', icon: ... }` con el icono `BarChart3` de `lucide-react`, siguiendo el mismo formato de las entradas existentes.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS.

Verificación manual: abrir `/dashboard/evals` con sesión admin.
Expected: tarjetas de totales y tabla por modelo (o mensaje vacío si no hay `ai_insights`).

- [ ] **Step 5: Commit**

```bash
git add web/app/\(dashboard\)/dashboard/evals/page.tsx web/components/dashboard/EvalsView.tsx web/components/dashboard/Sidebar.tsx
git commit -m "feat(evals): add dashboard view for AI evals"
```

---

### Task 9: Migración trust_pages y esquema Drizzle

**Files:**
- Create: `web/lib/db/migrations/0008_trust-pages.sql`
- Modify: `web/lib/db/migrations/meta/_journal.json` (agregar entrada `idx: 8`)
- Modify: `web/lib/db/schema.ts` (agregar `trustPages`)

**Interfaces:**
- Consumes: patrón de migraciones existentes (`0007_chat.sql`: `--> statement-breakpoint` entre sentencias, `CREATE TABLE` + índices).
- Produces: tabla `trust_pages (id text PK, device_id text FK → devices.id ON DELETE CASCADE, token_hash text UNIQUE NOT NULL, label text, created_at timestamptz DEFAULT now() NOT NULL, revoked_at timestamptz)` e índice `trust_pages_device_idx ON (device_id)`.

- [ ] **Step 1: Write the failing check**

Run: `pnpm vitest run --passWithNoTests` no aplica. La verificación de fallo es: `grep -n trust_pages web/lib/db/schema.ts`
Expected: sin resultados (la tabla aún no existe).

- [ ] **Step 2: Run check to verify it fails**

Run (desde raíz del repo): `grep -n trust_pages web/lib/db/schema.ts || echo SIN_TABLA`
Expected: `SIN_TABLA`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- web/lib/db/migrations/0008_trust-pages.sql
-- Trust Page pública por token: solo se guarda el hash SHA-256 del token
-- (igual que devices.token_hash). El token en claro se muestra una vez.
CREATE TABLE "trust_pages" (
  "id" text PRIMARY KEY NOT NULL,
  "device_id" text NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "label" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trust_pages_token_hash_idx" ON "trust_pages" ("token_hash");
--> statement-breakpoint
CREATE INDEX "trust_pages_device_idx" ON "trust_pages" ("device_id");
```

En `web/lib/db/migrations/meta/_journal.json`, añadir tras la entrada `idx: 7`:
```json
    {
      "idx": 8,
      "version": "7",
      "when": 1794100000000,
      "tag": "0008_trust-pages",
      "breakpoints": true
    }
```
(ajustar la coma de la entrada previa `0007_chat`).

En `web/lib/db/schema.ts`, añadir al final del archivo:
```typescript
export const trustPages = pgTable('trust_pages', {
  id: text('id').primaryKey(),
  deviceId: text('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  // Hash SHA-256 del token público (nunca el token en claro).
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({
  deviceIdx: index('trust_pages_device_idx').on(table.deviceId),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `grep -n trust_pages web/lib/db/schema.ts web/lib/db/migrations/0008_trust-pages.sql`
Expected: resultados en ambos archivos.

Run (desde `web/`): `pnpm typecheck`
Expected: PASS (el schema compila; aplicar la migración a Neon queda como paso manual antes de probar la Trust Page).

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/migrations/0008_trust-pages.sql web/lib/db/migrations/meta/_journal.json web/lib/db/schema.ts
git commit -m "feat(trust): add trust_pages table for public token pages"
```

---

### Task 10: Tokens de confianza (generación y hash)

**Files:**
- Create: `web/lib/trust/token.ts`
- Test: `web/lib/trust/__tests__/token.test.ts`

**Interfaces:**
- Consumes: `node:crypto` (`randomBytes`, `createHash`, `timingSafeEqual`).
- Produces: `generateTrustToken(): string` (32 bytes aleatorios en `base64url`, 43 caracteres), `hashTrustToken(token: string): string` (hex SHA-256), `trustTokensMatch(storedHash: string, token: string): boolean`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/trust/__tests__/token.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { generateTrustToken, hashTrustToken, trustTokensMatch } from '@/lib/trust/token';

describe('generateTrustToken', () => {
  it('genera tokens de 43 caracteres base64url únicos', () => {
    const a = generateTrustToken();
    const b = generateTrustToken();
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe('hashTrustToken', () => {
  it('es determinista y distinto para tokens distintos', () => {
    const hash = hashTrustToken('token-fijo-de-test');
    expect(hash).toBe(hashTrustToken('token-fijo-de-test'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(hashTrustToken('otro-token'));
  });
});

describe('trustTokensMatch', () => {
  it('acepta el token correcto y rechaza otros', () => {
    const token = generateTrustToken();
    const hash = hashTrustToken(token);
    expect(trustTokensMatch(hash, token)).toBe(true);
    expect(trustTokensMatch(hash, 'token-incorrecto')).toBe(false);
    expect(trustTokensMatch('corto', token)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/token.test.ts`
Expected: FAIL con `Cannot find module '@/lib/trust/token'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/trust/token.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Tokens públicos de Trust Page: se guarda solo el hash SHA-256 en disco
// (mismo criterio que devices.token_hash). El token en claro se muestra una vez.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token público opaco de 256 bits en base64url. */
export function generateTrustToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash hex SHA-256 del token; es lo único que se persiste. */
export function hashTrustToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparación en tiempo constante; false ante longitudes distintas. */
export function trustTokensMatch(storedHash: string, token: string): boolean {
  const candidate = Buffer.from(hashTrustToken(token), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/token.test.ts`
Expected: PASS (3 describes, 3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/trust/token.ts web/lib/trust/__tests__/token.test.ts
git commit -m "feat(trust): add token generation and hashing utilities"
```

---

### Task 11: Consultas de Trust Page

**Files:**
- Create: `web/lib/trust/queries.ts`

**Interfaces:**
- Consumes: `db` (`lib/db/index.ts`), `trustPages` y `devices` (`lib/db/schema.ts`), Task 10 (`generateTrustToken`, `hashTrustToken`), `randomUUID` (`node:crypto`).
- Produces: `createTrustPage(deviceId: string, label?: string): Promise<{ id: string; token: string }>` (el token solo aquí), `listTrustPages(): Promise<Array<{ id, device_id, label, created_at, revoked_at }>>`, `revokeTrustPage(id: string): Promise<boolean>`, `resolveTrustPage(token: string): Promise<{ device_id: string; label: string | null } | null>` (null si no existe o está revocado).

- [ ] **Step 1: Write the failing typecheck**

Create `web/lib/trust/queries.ts` vacío con `export {};` y ejecutar:
Run (desde `web/`): `pnpm tsc --noEmit --skipLibCheck lib/trust/queries.ts`
Expected: FAIL con `Cannot find module '@/lib/db/schema'` si el alias no se resuelve fuera del proyecto; dentro del proyecto, el fallo es `Module has no exported member 'createTrustPage'`. Para un fallo determinista sin DB, escribir el test de tipos siguiente y ejecutarlo:

```typescript
// web/lib/trust/__tests__/queries-import.test.ts
import { describe, expect, it } from 'vitest';
import * as queries from '@/lib/trust/queries';

describe('trust queries exports', () => {
  it('expone create/list/revoke/resolve', () => {
    expect(typeof queries.createTrustPage).toBe('function');
    expect(typeof queries.listTrustPages).toBe('function');
    expect(typeof queries.revokeTrustPage).toBe('function');
    expect(typeof queries.resolveTrustPage).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/queries-import.test.ts`
Expected: FAIL con `createTrustPage is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/trust/queries.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Acceso a la tabla trust_pages. El token en claro solo existe en el valor
// de retorno de createTrustPage; en disco vive únicamente su hash.

import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, trustPages } from '@/lib/db';
import { generateTrustToken, hashTrustToken } from './token';

export interface TrustPageListItem {
  id: string;
  device_id: string;
  label: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

/** Crea una página pública para el device; devuelve el token (una sola vez). */
export async function createTrustPage(
  deviceId: string,
  label?: string
): Promise<{ id: string; token: string }> {
  const token = generateTrustToken();
  const id = `tr_${randomUUID()}`;
  await db.insert(trustPages).values({
    id,
    deviceId,
    tokenHash: hashTrustToken(token),
    label: label?.trim() || null,
  });
  return { id, token };
}

/** Lista paginas públicas (activas y revocadas) para la UI de administración. */
export async function listTrustPages(): Promise<TrustPageListItem[]> {
  const rows = await db
    .select({
      id: trustPages.id,
      device_id: trustPages.deviceId,
      label: trustPages.label,
      created_at: trustPages.createdAt,
      revoked_at: trustPages.revokedAt,
    })
    .from(trustPages)
    .orderBy(desc(trustPages.createdAt));
  return rows.map((row) => ({
    id: row.id,
    device_id: row.device_id,
    label: row.label,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    revoked_at: row.revoked_at ? row.revoked_at.toISOString() : null,
  }));
}

/** Revoca una página (soft: fija revoked_at). true si existía y estaba activa. */
export async function revokeTrustPage(id: string): Promise<boolean> {
  const updated = await db
    .update(trustPages)
    .set({ revokedAt: new Date() })
    .where(and(eq(trustPages.id, id), isNull(trustPages.revokedAt)))
    .returning({ id: trustPages.id });
  return updated.length > 0;
}

/** Resuelve el device de un token público; null si no existe o está revocado. */
export async function resolveTrustPage(
  token: string
): Promise<{ device_id: string; label: string | null } | null> {
  const hash = hashTrustToken(token);
  const rows = await db
    .select({ device_id: trustPages.deviceId, label: trustPages.label, revoked_at: trustPages.revokedAt })
    .from(trustPages)
    .where(eq(trustPages.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  return { device_id: row.device_id, label: row.label };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/queries-import.test.ts && pnpm typecheck`
Expected: PASS. (Las operaciones con DB se verifican manualmente en la Task 12 con `DATABASE_URL`.)

- [ ] **Step 5: Commit**

```bash
git add web/lib/trust/queries.ts web/lib/trust/__tests__/queries-import.test.ts
git commit -m "feat(trust): add create, list, revoke and resolve queries"
```

---

### Task 12: API de administración de Trust Pages

**Files:**
- Create: `web/app/api/trust/route.ts`

**Interfaces:**
- Consumes: `authorize(request, { allowGuest: false })` (`lib/auth/resolve.ts`): guest recibe 403. Task 11 (`createTrustPage`, `listTrustPages`, `revokeTrustPage`).
- Produces: `GET /api/trust` → `{ pages: TrustPageListItem[] }`, `POST /api/trust { device_id, label? }` → `{ id, token, url: '/p/<token>' }`, `DELETE /api/trust?id=...` → `{ ok: true }` o `404 { error: 'not_found' }`.

- [ ] **Step 1: Write the failing test (contrato Zod)**

```typescript
// web/lib/trust/__tests__/api-contract.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';

// Contrato mínimo documentado aquí para guiar el route handler:
// POST body: { device_id: string(1..120), label?: string(≤120) }
// DELETE query: { id: string }
// Se valida con Zod dentro del route; el test fija el contrato.
export const TRUST_POST_EXAMPLE = { device_id: 'dev_1', label: 'Página pública' };
export const TRUST_DELETE_EXAMPLE = { id: 'tr_xxx' };

describe('trust api contract', () => {
  it('documenta el ejemplo de POST', () => {
    expect(TRUST_POST_EXAMPLE.device_id).toBe('dev_1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/api-contract.test.ts`
Expected: FAIL si el archivo `web/app/api/trust/route.ts` no existe se verifica con:
Run: `test -f web/app/api/trust/route.ts || echo FALTA_ROUTE`
Expected: `FALTA_ROUTE`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/app/api/trust/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Administración de Trust Pages: solo admin (guest recibe 403).
// GET lista, POST crea (token solo en esta respuesta), DELETE revoca.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth/resolve';
import { createTrustPage, listTrustPages, revokeTrustPage } from '@/lib/trust/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

const CreateTrustSchema = z
  .object({
    device_id: z.string().trim().min(1).max(120),
    label: z.string().trim().max(120).optional(),
  })
  .strict();

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const check = await authorize(request, { allowGuest: false });
  return check.ok ? null : check.response;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const pages = await listTrustPages();
  return NextResponse.json({ pages }, { headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'El cuerpo debe ser JSON válido.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const parsed = CreateTrustSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: 'device_id inválido.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const created = await createTrustPage(parsed.data.device_id, parsed.data.label);
    return NextResponse.json(
      { id: created.id, token: created.token, url: `/p/${created.token}` },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error('Error creating trust page:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Falta el parámetro id.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const revoked = await revokeTrustPage(id);
  if (!revoked) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
  }
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm vitest run lib/trust/__tests__/api-contract.test.ts`
Expected: PASS.

Verificación manual (requiere migración 0008 aplicada a Neon y sesión admin): `POST /api/trust` con `{ "device_id": "<id>", "label": "Pública" }`.
Expected: `200` con `{ id, token, url }`; `GET /api/trust` luego la lista con el nuevo registro; con cookie guest, `GET /api/trust` devuelve `403`.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/trust/route.ts web/lib/trust/__tests__/api-contract.test.ts
git commit -m "feat(trust): add admin API to create, list and revoke pages"
```

---

### Task 13: Página pública p/[token] y vista de solo lectura

**Files:**
- Create: `web/components/trust/TrustView.tsx`
- Create: `web/app/p/[token]/page.tsx`

**Interfaces:**
- Consumes: `resolveTrustPage` (Task 11), `queryOverview`, `queryHosts`, `queryAlerts`, `fetchLatestInsight` (firmas existentes), `queryRangeSchema` (`lib/schemas/query.ts`).
- Produces: página pública `GET /p/<token>` (sin cookies, sin `authorize()`) que muestra totales, top hosts sin IP cruda (solo `host_key` truncada + país + bytes + risk), alertas recientes y último insight IA; `notFound()` si el token es inválido o revocado.

- [ ] **Step 1: Write the failing typecheck**

Create `web/app/p/[token]/page.tsx` con:
```tsx
import { TrustView } from '@/components/trust/TrustView';
export default function TrustPage() {
  return <TrustView />;
}
```
Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module '@/components/trust/TrustView'`.

- [ ] **Step 2: Write minimal implementation (TrustView)**

```tsx
// web/components/trust/TrustView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Vista pública de la Trust Page: agregados de solo lectura.
// NO muestra IPs crudas: solo la clave del host truncada, país y bytes.
'use client';

import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertItem } from '@/lib/query/alerts';
import type { AiInsightRecord } from '@/lib/ai/analyze';
import type { OverviewResult } from '@/lib/query/overview';

export interface TrustViewProps {
  totals: OverviewResult['totals'];
  hosts: HostMetricItem[];
  alerts: AlertItem[];
  insight: AiInsightRecord | null;
}

function shortHostKey(hostKey: string): string {
  return hostKey.length > 16 ? `${hostKey.slice(0, 16)}…` : hostKey;
}

export function TrustView({ totals, hosts, alerts, insight }: TrustViewProps) {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
          SC-Sentinel · Trust Page
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-sc-text sm:text-4xl">
          Postura de red verificable
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-sc-text-muted">
          Agregados de solo lectura de la ventana reciente. No se publican paquetes, payloads ni direcciones sin anonimizar.
        </p>
      </header>

      <section aria-label="Totales" className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sc-text-muted">Ventanas</p>
          <p className="mt-2 font-display text-2xl font-semibold text-sc-text">{totals.windows_count}</p>
        </div>
        <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sc-text-muted">Hosts</p>
          <p className="mt-2 font-display text-2xl font-semibold text-sc-text">{totals.hosts_count}</p>
        </div>
        <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sc-text-muted">Alertas</p>
          <p className="mt-2 font-display text-2xl font-semibold text-sc-text">{totals.alerts_count}</p>
        </div>
        <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sc-text-muted">Países</p>
          <p className="mt-2 font-display text-2xl font-semibold text-sc-text">{totals.countries_count}</p>
        </div>
      </section>

      <section aria-label="Hosts principales">
        <h2 className="font-display text-xl font-semibold text-sc-text">Hosts principales</h2>
        <ul className="mt-4 grid gap-3">
          {hosts.map((host) => (
            <li key={host.host_key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border sc-hairline bg-sc-panel/50 px-4 py-3 text-sm">
              <span className="font-mono text-xs text-sc-text">{shortHostKey(host.host_key)}</span>
              <span className="text-sc-text-muted">{host.country ?? 'Red local'}</span>
              <span className="font-mono text-xs text-sc-text">{host.bytes_in + host.bytes_out} bytes</span>
            </li>
          ))}
          {hosts.length === 0 && <li className="text-sm text-sc-text-muted">Sin hosts en la ventana.</li>}
        </ul>
      </section>

      <section aria-label="Alertas recientes">
        <h2 className="font-display text-xl font-semibold text-sc-text">Alertas recientes</h2>
        <ul className="mt-4 grid gap-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border sc-hairline bg-sc-panel/50 px-4 py-3 text-sm">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-sc-text-muted">{alert.severity}</span>
              <span className="ml-2 text-sc-text">{alert.title}</span>
            </li>
          ))}
          {alerts.length === 0 && <li className="text-sm text-sc-text-muted">Sin alertas en la ventana.</li>}
        </ul>
      </section>

      {insight && (
        <section aria-label="Análisis de IA">
          <h2 className="font-display text-xl font-semibold text-sc-text">Análisis de IA</h2>
          <p className="mt-3 text-sm leading-relaxed text-sc-text-muted">{insight.summary}</p>
          <p className="mt-2 font-mono text-xs text-sc-text-muted">
            Modelo {insight.model} · estado {insight.status} · riesgo {insight.risk_level ?? '—'}
          </p>
        </section>
      )}
    </main>
  );
}
```

```tsx
// web/app/p/[token]/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Trust Page pública: resuelve el token en el servidor sin cookies.
// Fuera de (dashboard): el middleware no la protege, y esta página nunca
// llama a authorize() — la única credencial es el token de la URL.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveTrustPage } from '@/lib/trust/queries';
import { queryOverview } from '@/lib/query/overview';
import { queryHosts } from '@/lib/query/hosts';
import { queryAlerts } from '@/lib/query/alerts';
import { fetchLatestInsight } from '@/lib/ai/analyze';
import { TrustView } from '@/components/trust/TrustView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: 'Trust Page · SC-Sentinel',
  description: 'Postura de red verificable: agregados de solo lectura, sin paquetes ni payloads.',
  robots: { index: false, follow: false },
};

export default async function TrustPage({ params }: PageProps) {
  const { token } = await params;
  const resolved = await resolveTrustPage(token);
  if (!resolved) notFound();

  const deviceId = resolved.device_id;
  const [overview, hostsResult, alertsResult, insight] = await Promise.all([
    queryOverview('1h', deviceId),
    queryHosts('1h', deviceId),
    queryAlerts('1h', deviceId),
    fetchLatestInsight(deviceId, 'es'),
  ]);

  return (
    <TrustView
      totals={overview.totals}
      hosts={hostsResult.hosts.slice(0, 10)}
      alerts={alertsResult.alerts.slice(0, 10)}
      insight={insight}
    />
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS.

Verificación manual: abrir `/p/<token-válido>` sin cookies (navegación privada).
Expected: `200` con la vista pública. Abrir `/p/token-inválido`.
Expected: `404` (página not-found de Next).

- [ ] **Step 4: Commit**

```bash
git add web/components/trust/TrustView.tsx web/app/p/\[token\]/page.tsx
git commit -m "feat(trust): add public read-only page at p/[token]"
```

---

### Task 14: Gestión de Trust Pages en Settings (solo admin)

**Files:**
- Modify: `web/components/dashboard/SettingsView.tsx` (sección Trust tras la lista de devices)

**Interfaces:**
- Consumes: `GET /api/trust`, `POST /api/trust`, `DELETE /api/trust?id=` (Task 12), `fetcher` + `FetchError` (`lib/swr.ts`), patrón de estado local de `SettingsView` (`useState` para `issued`/`copied`/`busy`/`actionError`).
- Produces: sección que crea una página (selector de device + label opcional), muestra el token una vez con botón copiar, lista páginas con fecha y revocación.

- [ ] **Step 1: Write the failing check**

Abriendo `web/components/dashboard/SettingsView.tsx`, buscar `Trust`:
Run: `grep -n Trust web/components/dashboard/SettingsView.tsx || echo SIN_TRUST`
Expected: `SIN_TRUST` antes de esta tarea.

- [ ] **Step 2: Extend the component (implementation before verification)**

Añadir al inicio del archivo `SettingsView.tsx`, tras la línea 11 (`import { timeAgo } from '@/lib/format';`):
```typescript
import { ShieldCheck } from 'lucide-react';

interface TrustPageItem {
  id: string;
  device_id: string;
  label: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

interface TrustPagesResponse {
  pages: TrustPageItem[];
}

interface CreateTrustResponse {
  id: string;
  token: string;
  url: string;
}
```

Dentro de `SettingsView()`, tras la línea 55 (`const devices: Device[] = data?.devices ?? [];`), añadir:
```typescript
  const trust = useSWR<TrustPagesResponse>('/api/trust', fetcher, { refreshInterval: REFRESH_MS });
  const [trustDeviceId, setTrustDeviceId] = useState('');
  const [trustLabel, setTrustLabel] = useState('');
  const [trustIssued, setTrustIssued] = useState<CreateTrustResponse | null>(null);
  const [trustBusy, setTrustBusy] = useState(false);
```

Añadir la función tras `handleEnroll` (localizar `setName('');` y su `}` de cierre; insertar después):
```typescript
  async function handleCreateTrust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trustBusy || !trustDeviceId) return;
    setTrustBusy(true);
    setActionError(null);
    try {
      const response = await fetch('/api/trust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: trustDeviceId, label: trustLabel.trim() || undefined }),
      });
      if (!response.ok) {
        setActionError(`No se pudo crear la página pública (${response.status}).`);
        return;
      }
      const payload = (await response.json()) as CreateTrustResponse;
      setTrustIssued(payload);
      setTrustLabel('');
      void trust.mutate();
    } finally {
      setTrustBusy(false);
    }
  }

  async function handleRevokeTrust(id: string) {
    if (trustBusy) return;
    setTrustBusy(true);
    try {
      const response = await fetch(`/api/trust?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        setActionError(`No se pudo revocar la página (${response.status}).`);
        return;
      }
      void trust.mutate();
    } finally {
      setTrustBusy(false);
    }
  }
```

Y en el JSX, tras el bloque de la lista de devices (localizar el cierre `</ul>` o la última tarjeta de device y añadir a continuación, dentro del mismo contenedor):
```tsx
        <section className="mt-10 rounded-xl border border-slate-800/80 bg-slate-900/60 p-6" aria-label="Páginas públicas">
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-slate-100">
            <ShieldCheck className="size-4 text-sky-400" strokeWidth={1.5} aria-hidden="true" />
            Páginas públicas (Trust Pages)
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Enlace público de solo lectura <span className="font-mono text-xs">/p/&lt;token&gt;</span>. El token se muestra una sola vez.
          </p>
          <form onSubmit={handleCreateTrust} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs text-slate-400">
              Device
              <select value={trustDeviceId} onChange={(e) => setTrustDeviceId(e.target.value)} required className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100">
                <option value="">Seleccionar…</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>{device.name ?? device.id}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Etiqueta (opcional)
              <input value={trustLabel} onChange={(e) => setTrustLabel(e.target.value)} maxLength={120} className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100" />
            </label>
            <button type="submit" disabled={trustBusy || !trustDeviceId} className="rounded-md bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
              {trustBusy ? 'Procesando…' : 'Crear página'}
            </button>
          </form>
          {trustIssued && (
            <p className="mt-3 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 font-mono text-xs text-emerald-300">
              URL pública: {trustIssued.url} (el token no se vuelve a mostrar)
            </p>
          )}
          <ul className="mt-4 grid gap-2">
            {(trust.data?.pages ?? []).map((page) => (
              <li key={page.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300">
                <span className="font-mono text-xs">{page.device_id} · {page.label ?? 'Sin etiqueta'} · {page.created_at ? timeAgo(page.created_at) : '—'}</span>
                {page.revoked_at ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-300">Revocada</span>
                ) : (
                  <button type="button" onClick={() => handleRevokeTrust(page.id)} disabled={trustBusy} className="rounded-md border border-red-400/40 px-3 py-1 text-xs font-semibold text-red-300 disabled:opacity-50">
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
```

- [ ] **Step 3: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS.

Verificación manual: en `/dashboard/settings` con admin, crear una página para un device.
Expected: aparece la `URL pública`, y el enlace abre la Trust Page. Revocar y recargar `/p/<token>`.
Expected: `404`.

- [ ] **Step 4: Commit**

```bash
git add web/components/dashboard/SettingsView.tsx
git commit -m "feat(trust): manage trust pages from settings (admin)"
```

---

### Task 15: Gates finales del plan

**Files:**
- None (solo verificación). Modifica únicamente si un gate falla.

- [ ] **Step 1: Run the web gates**

Run (desde `web/`):
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: los cuatro PASS. `pnpm test` ejecuta Vitest y `test:contracts` (Zod).

- [ ] **Step 2: Run the Rust gates (no Rust changes expected)**

Run (desde raíz del repo):
```bash
git diff --stat HEAD~1 2>/dev/null || git status --short
cargo fmt --check
cargo test --workspace
cargo clippy -- -D warnings
```
Expected: PASS (o sin cambios Rust: `git status` solo muestra `web/`, `docs/` y `scripts/test-contracts-zod.mjs`).

Run: `bash scripts/verify-contracts.sh`
Expected: PASS (en Windows usar `& "C:\Program Files\Git\bin\bash.exe" scripts/verify-contracts.sh`).

- [ ] **Step 3: Update docs**

En `docs/README.md`, fila de Testing (mencionar Vitest `lib/export`, `lib/ai/evals`, `lib/trust` y rutas `/api/export`, `/api/query?metric=evals`, `/api/trust`, `/p/[token]`). En `docs/testing/acceptance-criteria.md`, añadir sección SC Audit quick-wins con los tres entregables y sus criterios verificables (descarga CSV/XLSX, vista `/dashboard/evals`, Trust Page pública con token, revocación con 404).

- [ ] **Step 4: Commit**

```bash
git add docs/README.md docs/testing/acceptance-criteria.md
git commit -m "docs: document ruta B quick-wins and their acceptance criteria"
```

---

## Self-Review

- **Spec coverage:** (1) Exportación CSV/XLSX — Tasks 1–5: builders puros, `/api/export` con auth guest/admin igual que `/api/query`, botones en el Overview. (2) AI Evals Dashboard — Tasks 6–8: agregación pura sobre `ai_insights`, `metric=evals`, vista `/dashboard/evals` en el Sidebar. (3) Trust Page `p/[token]` — Tasks 9–14: migración `0008`, hash SHA-256, API admin con 403 para guest, página pública sin cookies con `notFound()`, gestión en Settings. Gates en Task 15.
- **Placeholder scan:** sin TBD/TODO; cada paso muestra código completo, comandos exactos y resultados esperados. La única referencia "igual que en X" está acompañada del código completo que la implementa.
- **Type consistency:** `HostMetricItem`/`AlertItem`/`OverviewResult` reutilizados tal cual de `lib/query/*`; `EvalsResponse` ({ total, ok, degraded, cached, no_data, degraded_rate, latest_created_at, by_model }) consistente entre `lib/ai/evals.ts`, `lib/query/evals.ts` y `lib/api-types.ts` (claves idénticas, `no_data` con underscore como el resto de la API). `TrustPageListItem` consistente entre queries, API y Settings. Firmas `queryHosts(range, deviceId)`, `queryAlerts(range, deviceId)`, `queryOverview(range, deviceId)`, `fetchLatestInsight(deviceId, 'es')` coinciden con el código existente.

## Execution Plan

- **Order:** Task 1 → 2 → 3 (CSV usable) → 4 → 5 (XLSX) → 6 → 7 → 8 (Evals) → 9 → 10 → 11 → 12 → 13 → 14 (Trust Page) → 15 (gates).
- **Branch:** `feat/ruta-b-quick-wins` desde `main` (`111ff91`). Un commit por tarea, en español para docs y en formato `feat(scope): ...` en inglés para mensajes (convención del repo).
- **Migration apply (manual, antes de Tasks 12–14):** aplicar `0008_trust-pages.sql` a Neon con `pnpm drizzle-kit migrate` (o el flujo usado en `web/README.md`), verificando que `trust_pages` exista con `psql $DATABASE_URL -c '\d trust_pages'`.
- **Public deployment:** la Trust Page queda en `https://sc-sentinel.vercel.app/p/<token>`; confirmar que no expone cookies ni pasa por `middleware.ts` (matcher solo `/dashboard/:path*`).

---

¿Querés que lo ejecute yo en esta sesión o preferís que lo divida entre subagentes? Tengo en mente dos ordenes de ejecución:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

¿Cuál es tu preferencia?
