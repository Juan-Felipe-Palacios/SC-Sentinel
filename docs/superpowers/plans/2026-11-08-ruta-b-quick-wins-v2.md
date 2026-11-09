# Ruta B Quick-Wins v2 (Enterprise-Grade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

I'm using the writing-plans skill to create the implementation plan.

**Goal:** Deliver the three SC Audit quick-wins as production-ready enterprise features: robust export with streaming and audit logs, AI evals with cost and latency observability, and a Trust Page with rotation, access logs and rate limiting.

**Architecture:** Fase 1 Export: pure CSV/XLSX builders (anti-injection) plus `GET /api/export` with export-specific queries capped at 10,000 rows, `ReadableStream` CSV for large sets, multi-sheet XLSX (Overview/Hosts/Windows) and an `export_logs` audit table shown at `/dashboard/admin/exports`. Fase 2 Evals: providers return real `input_tokens`/`output_tokens`/`latency_ms`/`status_code` (already logged today, now returned), persisted in `ai_insights` via migration `0009`, aggregated by `metric=evals` with daily cost, tokens per model and p50/p95 latency, charted with Recharts; cost alerts via structured log plus optional webhook (no email service exists in the repo today). Fase 3 Trust Page: `trust_pages` with `expires_at`/`revoked_at`/`last_rotated_at` (migration `0010`), rotate/revoke endpoints, `trust_page_access_logs` with anonymized IP, per-token rate limit 100/hour and >1000/day leak alert (log + webhook), public `app/p/[token]/page.tsx` returning 404 for unknown/expired/revoked tokens. Fase 4: runbooks and metrics docs plus full gates.

**Tech Stack:** Next.js 15.5.28 App Router (React 19.1.0, TypeScript 5.9.3), Vitest 5.1.0 (`environment: 'node'`, `include: ['lib/**/*.test.ts', 'app/**/*.test.ts']`, alias `'@'` → `web/`), Drizzle ORM 0.45.4 on Neon (`@neondatabase/serverless`), Zod 4.6.7, `xlsx` 0.18.5, `recharts` 3.10.1 (already in `web/package.json`), SWR 2.5.1, `node:crypto` (`randomBytes`, `createHash`, `timingSafeEqual`), token-bucket `checkRateLimit` from `lib/rate-limit/ingest.ts` (same primitive as `lib/rate-limit/guest.ts`).

## Global Constraints

- No tocar `agent/spool/maintenance.ps1` (el fix vive en PR #2, ya mergeado).
- `host_stats` es deliberado, no cambiar su diseño. Las consultas de export reutilizan `host_stats` + `flow_windows` con `LIMIT 10001`; no se agregan columnas a `host_stats`.
- Para el test anti-drift, comparar `serde_json::Value`, no strings (aplica a Rust; en `web/` los tests comparan valores parseados).
- No subir a edition 2024 / MSRV 1.85 / pnpm 10 sin un cambio dedicado. Este plan solo agrega el paquete `xlsx` con `pnpm add xlsx@^0.18.5`, sin subir versiones de tooling.
- Documentación y comentarios en español; identificadores en inglés.
- Gates Rust obligatorios tras cualquier cambio Rust: `cargo fmt --check`, `cargo test --workspace`, `clippy -D warnings`, `scripts/verify-contracts.sh`. Este plan no toca Rust: verificar con `git diff --stat` que no haya cambios fuera de `web/`, `docs/`.
- Gates web obligatorios por feature: desde `web/`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Rutas API: cabeceras `Cache-Control: no-store, max-age=0`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` cuando se lea la base (patrón de `app/api/query/route.ts`).
- Guest (cookie `sc_guest`) solo lectura, acotado a su `deviceId` del token; nunca aceptar `device_id` del query param para guest. Admin vía `authorize()` en `lib/auth/resolve.ts`.
- `middleware.ts` solo protege `/dashboard/:path*`. La Trust Page `p/[token]` es pública por diseño; el rate limit por token se hace en el route handler de la página, no en el middleware.
- `user_id` no existe en este repo (no hay tabla de usuarios; auth es admin por secret o guest por token). `export_logs` usa `role` (`admin`|`guest`) + `device_id` nullable en lugar de `user_id`.
- No existe infraestructura de email en el repo. Las "alertas por email" de v2 se implementan como log estructurado `console.log` + POST opcional a `AI_COST_ALERT_WEBHOOK_URL` / `TRUST_ALERT_WEBHOOK_URL`; si la URL no está definida, solo se loguea. No se agrega Resend ni otro proveedor en esta tarea.
- `cost_usd` se calcula desde conteos de tokens con tabla de precios configurable por env `AI_PRICING_JSON`; los modelos por defecto agendados (`openrouter/free`, Gemini Flash free, Groq OSS) tienen precio `0` si la entrada falta, porque hoy son free. Coste `0` con modelos free es el comportamiento correcto, no un dato faltante.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `web/lib/export/csv.ts` | Constructores puros de CSV con sanitización anti-injection y escaping RFC 4180. |
| `web/lib/export/__tests__/csv.test.ts` | Tests CSV + inyección (`=CMD(...)`, `+`, `-`, `@`). |
| `web/lib/export/xlsx.ts` | Workbook multi-sheet (Overview, Hosts, Windows). |
| `web/lib/export/__tests__/xlsx.test.ts` | Tests de sheets y filas. |
| `web/lib/export/stream.ts` | `csvResponseFromRows(header, batches)` → `ReadableStream` text/csv. |
| `web/lib/schemas/export.ts` | `ExportParamsSchema` (`metric`, `range`, `format`, `device_id`). |
| `web/lib/query/export.ts` | Consultas de export con `LIMIT 10001` (`queryHostsExport`, `queryAlertsExport`, `queryWindowsExport`). |
| `web/lib/query/__tests__/export.test.ts` | Test con fake `QueryDb` para límite 10001. |
| `web/app/api/export/route.ts` | `GET /api/export` con streaming, límite, logging en `export_logs`. |
| `web/components/dashboard/ExportBar.tsx` | Botones CSV/XLSX por métrica. |
| `web/components/dashboard/OverviewView.tsx` (modificar) | Monta `<ExportBar range={range} />`. |
| `web/lib/db/migrations/0008_export-logs.sql` | Tabla `export_logs`. |
| `web/lib/db/schema.ts` (modificar) | Export `exportLogs`. |
| `web/lib/export/log.ts` | `logExport(...)` best-effort (try/catch, no bloquea la descarga). |
| `web/app/(dashboard)/dashboard/admin/exports/page.tsx` | Página admin (server, exige admin). |
| `web/components/dashboard/AdminExportsView.tsx` | Cliente: tabla agregada desde `GET /api/export/stats`. |
| `web/app/api/export/stats/route.ts` | `GET` admin: agrega `export_logs` (30 días). |
| `web/lib/ai/metrics.ts` | `AiCallMetrics`, `toCallMetrics`, `estimateCostUsd`, `parsePricing`, `summarizeEvals`. |
| `web/lib/ai/__tests__/metrics.test.ts` | Tests de coste y agregación. |
| `web/lib/ai/openrouter.ts` (modificar) | `AiChainResult.usage` + `statusCode`; `callOpenRouterChain` retorna métricas reales. |
| `web/lib/ai/providers.ts` (modificar) | Gemini y Groq retornan métricas; `callAiChain` propaga el `usage` del eslabón ganador. |
| `web/lib/ai/analyze.ts` (modificar) | Persiste `input_tokens/output_tokens/cost_usd/latency_ms/status_code` en el INSERT. |
| `web/lib/db/migrations/0009_ai-evals-metrics.sql` | `ALTER TABLE ai_insights ADD COLUMN ...`. |
| `web/lib/query/evals.ts` | `queryEvals` v2: `dailyCost`, `tokensByModel`, `latencySeries` (p50/p95), `successRate`, `byModel`. |
| `web/lib/query/__tests__/evals.test.ts` | Tests agregación con fake DB. |
| `web/lib/schemas/query.ts` (modificar) | `metric` incluye `'evals'`. |
| `web/lib/api-types.ts` (modificar) | Espejo `EvalsResponse` v2. |
| `web/app/api/query/route.ts` (modificar) | Caso `evals`. |
| `web/app/(dashboard)/dashboard/evals/page.tsx` | Página server con `metadata`. |
| `web/components/dashboard/EvalsView.tsx` | Gráficos Recharts: línea coste/día, barras tokens/modelo, línea p50/p95, donut éxito/fallo. |
| `web/components/dashboard/Sidebar.tsx` (modificar) | Links `Evals de IA` y `Exports`. |
| `web/lib/ai/cost-alert.ts` | `maybeAlertCost(deviceId, database)` — log + webhook si coste diario > umbral. |
| `web/lib/db/migrations/0010_trust-pages.sql` | Tabla `trust_pages` con `expires_at`, `revoked_at`, `last_rotated_at`. |
| `web/lib/db/migrations/0011_trust-access-logs.sql` | Tabla `trust_page_access_logs`. |
| `web/lib/trust/token.ts` | Generación, hash, verificación. |
| `web/lib/trust/queries.ts` | `createTrustPage`, `listTrustPages`, `revokeTrustPage`, `rotateTrustPage`, `resolveTrustPage`. |
| `web/lib/trust/access-log.ts` | `anonymizeIp`, `hashUserAgent`, `logTrustAccess` (best-effort). |
| `web/lib/trust/__tests__/access-log.test.ts` | Tests de anonimización. |
| `web/lib/trust/rate-limit.ts` | `checkTrustRateLimit(tokenHash)` 100/h con `checkRateLimit`. |
| `web/lib/trust/__tests__/rate-limit.test.ts` | Tests de ventana 100/h. |
| `web/lib/trust/leak-alert.ts` | `maybeAlertLeak(tokenHash)` — cuenta 24h, log + webhook si >1000. |
| `web/app/api/trust/route.ts` | `GET` lista, `POST` crea, `DELETE` revoca (admin). |
| `web/app/api/trust/[id]/rotate/route.ts` | `POST` rota (admin, devuelve nuevo token una vez). |
| `web/app/p/[token]/page.tsx` | Página pública con 404 expirado/revocado/desconocido, rate limit y access log. |
| `web/components/trust/TrustView.tsx` | Vista pública de solo lectura. |
| `web/components/dashboard/SettingsView.tsx` (modificar) | Gestión de Trust Pages (crear, rotar, revocar). |
| `web/app/(dashboard)/dashboard/admin/trust-access/page.tsx` | Página admin (server, exige admin). |
| `web/components/dashboard/AdminTrustAccessView.tsx` | Cliente: lista `trust_page_access_logs`. |
| `web/app/api/trust/access/route.ts` | `GET` admin: lista accesos anonimizados (30 días, 500 filas). |
| `docs/runbooks/trust-page-rotation.md` | Rotación y revocación de tokens. |
| `docs/runbooks/export-large-datasets.md` | Exportar >10k filas: acotar por `range`, batch y streaming. |
| `docs/ai-evals-metrics.md` | Definición de métricas de IA y costes. |

---

### Task 1: Constructores CSV puros con sanitización anti-injection

**Files:**
- Create: `web/lib/export/csv.ts`
- Test: `web/lib/export/__tests__/csv.test.ts`

**Interfaces:**
- Consumes: `HostMetricItem` (`lib/query/hosts.ts`), `AlertItem` (`lib/query/alerts.ts`), `OverviewResult` (`lib/query/overview.ts`).
- Produces: `sanitizeCsvFormula(value: string): string`, `escapeCsvCell(...)`, `hostsToCsv(...)`, `alertsToCsv(...)`, `overviewToCsv(...)`. Sanitización: si la celda empieza con `=`, `+`, `-`, `@` (tras trim), se antepone `'` (Excel lo muestra como texto). Aplica además escaping RFC 4180.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/export/__tests__/csv.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { alertsToCsv, escapeCsvCell, hostsToCsv, sanitizeCsvFormula } from '@/lib/export/csv';
import type { HostMetricItem } from '@/lib/query/hosts';

describe('sanitizeCsvFormula', () => {
  it('antepone comilla simple a fórmulas peligrosas', () => {
    expect(sanitizeCsvFormula("=CMD('calc')")).toBe("'=CMD('calc')");
    expect(sanitizeCsvFormula('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
    expect(sanitizeCsvFormula('-2+3')).toBe("'-2+3");
    expect(sanitizeCsvFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(sanitizeCsvFormula('  =HYPERLINK("x")')).toBe("'  =HYPERLINK(\"x\")");
  });
  it('deja celdas normales intactas', () => {
    expect(sanitizeCsvFormula('plain')).toBe('plain');
    expect(sanitizeCsvFormula('192.168.0.1')).toBe('192.168.0.1');
  });
});

describe('escapeCsvCell', () => {
  it('envuelve en comillas y duplica comillas internas', () => {
    expect(escapeCsvCell('a"b,c\nd')).toBe('"a""b,c\nd"');
  });
  it('convierte null y undefined en celda vacía', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('hostsToCsv', () => {
  const hosts: HostMetricItem[] = [
    { host_key: 'hk_1', ip: '10.0.0.5', country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: '2026-01-01T00:00:00.000Z', last_seen: '2026-01-01T01:00:00.000Z' },
  ];
  it('emite encabezado y una fila por host', () => {
    const lines = hostsToCsv(hosts).trim().split('\n');
    expect(lines[0]).toBe('host_key,ip,country,bytes_in,bytes_out,packets,risk_score,first_seen,last_seen');
    expect(lines).toHaveLength(2);
  });
  it('emite solo el encabezado con lista vacía', () => {
    expect(hostsToCsv([]).trim().split('\n')).toHaveLength(1);
  });
});

describe('alertsToCsv', () => {
  it('sanitiza títulos que parecen fórmulas', () => {
    const csv = alertsToCsv([{ id: 'a1', window_id: 'w1', rule_id: 'r1', severity: 'high', title: '=CMD(\'calc\')', description: null, evidence: null, created_at: '2026-01-01T00:00:00.000Z' }]);
    expect(csv).toContain("'=CMD('calc')");
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
// Constructores puros de CSV (sin DB ni Next). Sanitización anti-injection
// (OWASP CSV Injection): celdas que empiezan con =, +, -, @ se anteponen
// con comilla simple para que Excel las trate como texto.

import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertItem } from '@/lib/query/alerts';
import type { OverviewResult } from '@/lib/query/overview';

/** Antepone ' si el valor (tras espacios) empieza con =, +, -, @. */
export function sanitizeCsvFormula(value: string): string {
  const trimmed = value.replace(/^\s+/, '');
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : sanitizeCsvFormula(String(value));
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
    lines.push(row([host.host_key, host.ip, host.country, host.bytes_in, host.bytes_out, host.packets, host.risk_score, host.first_seen, host.last_seen]));
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
git commit -m "feat(export): add sanitized pure CSV builders"
```

---

### Task 2: Schema y ruta GET /api/export (CSV base, sin streaming aún)

**Files:**
- Create: `web/lib/schemas/export.ts`
- Create: `web/app/api/export/route.ts`

**Interfaces:**
- Consumes: Task 1 (`hostsToCsv`, `alertsToCsv`, `overviewToCsv`), `authorize` + `clientIp` (`lib/auth/resolve.ts`), `checkGuestRequestLimit` + `guestRateLimitResponse` (`lib/rate-limit/guest.ts`), `resolveDeviceId` (`lib/query/device.ts`), `queryOverview`/`queryHosts`/`queryAlerts`.
- Produces: `ExportParamsSchema` (`metric: 'overview'|'hosts'|'alerts'`, `range`, `format: 'csv'|'xlsx'`, `device_id?`). En esta tarea el route solo soporta `format=csv`; `xlsx` se rechaza con 501 hasta la Task 5.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/schemas/export.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { ExportParamsSchema } from '@/lib/schemas/export';

describe('ExportParamsSchema', () => {
  it('acepta metric/range/format csv con defaults y xlsx', () => {
    expect(ExportParamsSchema.parse({ metric: 'hosts' })).toEqual({ metric: 'hosts', range: '1h', format: 'csv', device_id: undefined });
    expect(ExportParamsSchema.parse({ metric: 'hosts', format: 'xlsx' }).format).toBe('xlsx');
  });
  it('rechaza métricas no exportables y metric ausente', () => {
    expect(() => ExportParamsSchema.parse({ metric: 'health' })).toThrow();
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
import { z } from 'zod';
import { queryRangeSchema } from './query';

export const ExportParamsSchema = z.object({
  metric: z.enum(['overview', 'hosts', 'alerts']),
  range: queryRangeSchema,
  format: z.enum(['csv', 'xlsx']).default('csv'),
  device_id: z.string().min(1).optional(),
});

export type ExportParams = z.infer<typeof ExportParamsSchema>;
```

```typescript
// web/app/api/export/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/export?metric=hosts|overview|alerts&range=1h&format=csv
// Reutiliza autorización y consultas de /api/query. XLSX llega en Task 5.
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
  const { metric, range, format, device_id } = parsed.data;
  if (format === 'xlsx') {
    return NextResponse.json({ error: 'not_implemented', message: 'XLSX estará disponible en la Task 5.' }, { status: 501, headers: noStoreHeaders });
  }

  let guestDeviceId: string | null = null;
  if (auth.role === 'guest') {
    const limit = checkGuestRequestLimit(clientIp(request));
    if (!limit.allowed) return guestRateLimitResponse(limit.retryAfterSeconds);
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
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sc-sentinel-${metric}-${range}.csv"`,
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
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/schemas/export.ts web/lib/schemas/export.test.ts web/app/api/export/route.ts
git commit -m "feat(export): add GET /api/export with base CSV"
```

---

### Task 3: Botones de exportación en el Overview

**Files:**
- Create: `web/components/dashboard/ExportBar.tsx`
- Modify: `web/components/dashboard/OverviewView.tsx:1-30` (import) y el bloque de cabecera (insertar `<ExportBar range={range} />`).

**Interfaces:**
- Consumes: `QueryRange` (`lib/schemas/query.ts`). Enlaces absolutos a `/api/export` (las cookies viajan en navegación normal).
- Produces: `<ExportBar range: QueryRange />` con 3 métricas × CSV/XLSX.

- [ ] **Step 1: Write the failing typecheck**

Añadir temporalmente a `web/components/dashboard/OverviewView.tsx` tras la línea 29 (`import { useDashboardRole } from './DashboardRoleContext';`): `import { ExportBar } from './ExportBar';` y dentro del JSX `<ExportBar range={range} />`.
Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module './ExportBar'`.

- [ ] **Step 2: Run typecheck to verify it fails**

Run (desde `web/`): `pnpm tsc --noEmit`
Expected: FAIL con `Cannot find module './ExportBar'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web/components/dashboard/ExportBar.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
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

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/ExportBar.tsx web/components/dashboard/OverviewView.tsx
git commit -m "feat(export): add ExportBar download links to the overview"
```

---

### Task 4: Streaming CSV y límite de 10,000 filas (Tasks 3b + 5b)

**Files:**
- Create: `web/lib/query/export.ts`
- Test: `web/lib/query/__tests__/export.test.ts`
- Create: `web/lib/export/stream.ts`
- Modify: `web/app/api/export/route.ts` (usar consultas de export + `ReadableStream`)

**Interfaces:**
- Consumes: `queryRows` + `defaultQueryDb` (`lib/query/db-rows.ts`), `getRangeBounds` (`lib/query/range.ts`), Task 1 (`hostsToCsv` sigue para overview), `escapeCsvCell` (`lib/export/csv.ts`).
- Produces: `EXPORT_ROW_LIMIT = 10_000`, `ExportTooLargeError` (fija `status = 413`), `queryHostsExport(range, deviceId, database, now)`, `queryAlertsExport(...)`, `queryWindowsExport(...)` (cada una `LIMIT 10001`), `csvStreamFromRows(header: string, rows: string[]): ReadableStream<Uint8Array>`, `toCsvLines(header, rows) → string`. Si el resultado trae 10001 filas, el route responde `413 { error: 'dataset_too_large', message: 'Dataset demasiado grande, filtra por fecha (limit 10000 filas).' }`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/query/__tests__/export.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { EXPORT_ROW_LIMIT, queryHostsExport } from '@/lib/query/export';
import type { QueryDb } from '@/lib/query/db-rows';
import type { SQL } from 'drizzle-orm';

function fakeDb(rows: unknown[]): QueryDb {
  return { execute: (_query: SQL) => Promise.resolve({ rows }) };
}

describe('export row limit', () => {
  it('fija el límite en 10000', () => {
    expect(EXPORT_ROW_LIMIT).toBe(10_000);
  });
  it('devuelve vacío sin device_id sin tocar la base', async () => {
    const failing: QueryDb = { execute: () => Promise.reject(new Error('no debe llamar')) };
    await expect(queryHostsExport('1h', null, failing)).resolves.toEqual({ rows: 0, hosts: [] });
  });
  it('mapea filas del fake DB', async () => {
    const result = await queryHostsExport('1h', 'dev_1', fakeDb([
      { host_key: 'hk_1', ip: '10.0.0.5', country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: '0.9', first_seen: '2026-01-01T00:00:00.000Z', last_seen: '2026-01-01T01:00:00.000Z' },
    ]));
    expect(result).toMatchObject({ rows: 1, hosts: [{ host_key: 'hk_1', bytes_in: 100 }] });
  });
});
```

```typescript
// web/lib/export/__tests__/stream.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { csvStreamFromRows } from '@/lib/export/stream';

describe('csvStreamFromRows', () => {
  it('emite encabezado y filas en orden', async () => {
    const stream = csvStreamFromRows('a,b', ['1,2', '3,4']);
    const text = await new Response(stream).text();
    expect(text).toBe('a,b\n1,2\n3,4\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/query/__tests__/export.test.ts lib/export/__tests__/stream.test.ts`
Expected: FAIL con `Cannot find module '@/lib/query/export'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/query/export.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Consultas exclusivas de exportación con límite 10000. Reutilizan el SQL de
// hosts/alerts pero con LIMIT 10001 para detectar desborde sin falsos positivos.
// El dashboard sigue usando HOSTS_LIMIT=50 / ALERTS_LIMIT=100.

import { sql } from 'drizzle-orm';
import { getRangeBounds } from './range';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';
import type { HostMetricItem } from './hosts';
import type { AlertItem } from './alerts';

export const EXPORT_ROW_LIMIT = 10_000;
// LIMIT 10001: si el resultado trae 10001, hay más de 10000 y el route responde 413.
const LIMIT_WITH_OVERFLOW = EXPORT_ROW_LIMIT + 1;

export class ExportTooLargeError extends Error {
  status = 413;
  constructor() {
    super('Dataset demasiado grande, filtra por fecha');
    this.name = 'ExportTooLargeError';
  }
}

export interface ExportHostsResult { rows: number; hosts: HostMetricItem[] }
export interface ExportAlertsResult { rows: number; alerts: AlertItem[] }
export interface ExportWindowItem { window_id: string; start_at: string | null; end_at: string | null; sequence: number }
export interface ExportWindowsResult { rows: number; windows: ExportWindowItem[] }

interface HostRow {
  host_key: string; ip: string | null; country: string | null;
  bytes_in: number | string | null; bytes_out: number | string | null; packets: number | string | null;
  risk_score: string | null; first_seen: Date | string | null; last_seen: Date | string | null;
}

function parseRiskScore(value: string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function queryHostsExport(range: QueryRange = '1h', deviceId?: string | null, database: QueryDb = defaultQueryDb, now: Date = new Date()): Promise<ExportHostsResult> {
  if (!deviceId) return { rows: 0, hosts: [] };
  const { start, end } = getRangeBounds(range, now);
  const rows = await queryRows<HostRow>(
    database,
    sql`SELECT hs.host_key,
               (array_agg(hs.ip_display ORDER BY fw.start_at DESC) FILTER (WHERE hs.ip_display IS NOT NULL))[1] AS ip,
               (array_agg(hs.country ORDER BY fw.start_at DESC) FILTER (WHERE hs.country IS NOT NULL))[1] AS country,
               COALESCE(SUM(hs.bytes_in), 0)::bigint AS bytes_in,
               COALESCE(SUM(hs.bytes_out), 0)::bigint AS bytes_out,
               COALESCE(SUM(hs.packets), 0)::bigint AS packets,
               (array_agg(hs.risk_score ORDER BY fw.start_at DESC) FILTER (WHERE hs.risk_score IS NOT NULL))[1] AS risk_score,
               MIN(fw.start_at) AS first_seen,
               MAX(fw.end_at) AS last_seen
        FROM host_stats hs
        INNER JOIN flow_windows fw ON fw.window_id = hs.window_id
        WHERE fw.device_id = ${deviceId}
          AND fw.start_at >= ${start.toISOString()}::timestamptz
          AND fw.start_at < ${end.toISOString()}::timestamptz
        GROUP BY hs.host_key
        ORDER BY SUM(hs.bytes_in + hs.bytes_out) DESC
        LIMIT ${LIMIT_WITH_OVERFLOW}`
  );
  const hosts = rows.map((row) => ({
    host_key: row.host_key,
    ip: row.ip ?? null,
    country: row.country,
    bytes_in: bigintToNumber(row.bytes_in),
    bytes_out: bigintToNumber(row.bytes_out),
    packets: bigintToNumber(row.packets),
    risk_score: parseRiskScore(row.risk_score),
    first_seen: isoOrNull(row.first_seen),
    last_seen: isoOrNull(row.last_seen),
  }));
  if (hosts.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError();
  return { rows: hosts.length, hosts };
}

export async function queryAlertsExport(range: QueryRange = '1h', deviceId?: string | null, database: QueryDb = defaultQueryDb, now: Date = new Date()): Promise<ExportAlertsResult> {
  if (!deviceId) return { rows: 0, alerts: [] };
  const { start, end } = getRangeBounds(range, now);
  const rows = await queryRows<{ id: string; window_id: string; rule_id: string; severity: string; title: string; description: string | null; evidence: unknown; created_at: Date | string | null }>(
    database,
    sql`SELECT a.id, a.window_id, a.rule_id, a.severity, a.title, a.description, a.evidence, fw.start_at AS created_at
        FROM alerts a
        INNER JOIN flow_windows fw ON fw.window_id = a.window_id
        WHERE fw.device_id = ${deviceId}
          AND fw.start_at >= ${start.toISOString()}::timestamptz
          AND fw.start_at < ${end.toISOString()}::timestamptz
        ORDER BY fw.start_at DESC
        LIMIT ${LIMIT_WITH_OVERFLOW}`
  );
  const alerts: AlertItem[] = rows.map((row) => ({
    id: row.id, window_id: row.window_id, rule_id: row.rule_id, severity: row.severity, title: row.title,
    description: row.description, evidence: null, created_at: isoOrNull(row.created_at),
  }));
  if (alerts.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError();
  return { rows: alerts.length, alerts };
}

export async function queryWindowsExport(range: QueryRange = '1h', deviceId?: string | null, database: QueryDb = defaultQueryDb, now: Date = new Date()): Promise<ExportWindowsResult> {
  if (!deviceId) return { rows: 0, windows: [] };
  const { start, end } = getRangeBounds(range, now);
  const rows = await queryRows<{ window_id: string; start_at: Date | string | null; end_at: Date | string | null; sequence: number | string | null }>(
    database,
    sql`SELECT window_id, start_at, end_at, sequence
        FROM flow_windows
        WHERE device_id = ${deviceId}
          AND start_at >= ${start.toISOString()}::timestamptz
          AND start_at < ${end.toISOString()}::timestamptz
        ORDER BY start_at ASC
        LIMIT ${LIMIT_WITH_OVERFLOW}`
  );
  const windows = rows.map((row) => ({
    window_id: row.window_id,
    start_at: isoOrNull(row.start_at),
    end_at: isoOrNull(row.end_at),
    sequence: bigintToNumber(row.sequence),
  }));
  if (windows.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError();
  return { rows: windows.length, windows };
}
```

```typescript
// web/lib/export/stream.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Streaming CSV con ReadableStream: el encabezado y las filas se emiten en
// lotes de 500 para no materializar un string gigante en memoria ni bloquear
// el hilo con un join de 10k filas. Node runtime only.

const BATCH_SIZE = 500;
const encoder = new TextEncoder();

export function csvStreamFromRows(header: string, rows: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${header}\n`));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        controller.enqueue(encoder.encode(`${batch.join('\n')}\n`));
      }
      controller.close();
    },
  });
}
```

En `web/app/api/export/route.ts`, reemplazar el bloque CSV por streaming. El diff exacto contra la Task 2 es: importar `queryHostsExport`/`queryAlertsExport`/`queryWindowsExport`/`ExportTooLargeError` y `escapeCsvCell`/`csvStreamFromRows`, y en el `try` usar:

```typescript
  try {
    const deviceId = auth.role === 'guest' ? guestDeviceId : await resolveDeviceId(device_id);
    let header: string;
    let rows: string[];
    if (metric === 'hosts') {
      const result = await queryHostsExport(range, deviceId);
      header = 'host_key,ip,country,bytes_in,bytes_out,packets,risk_score,first_seen,last_seen';
      rows = result.hosts.map((h) => [h.host_key, h.ip, h.country, h.bytes_in, h.bytes_out, h.packets, h.risk_score, h.first_seen, h.last_seen].map(escapeCsvCell).join(','));
    } else if (metric === 'alerts') {
      const result = await queryAlertsExport(range, deviceId);
      header = 'id,window_id,rule_id,severity,title,created_at';
      rows = result.alerts.map((a) => [a.id, a.window_id, a.rule_id, a.severity, a.title, a.created_at].map(escapeCsvCell).join(','));
    } else {
      const csv = overviewToCsv(await queryOverview(range, deviceId));
      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...noStoreHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sc-sentinel-overview-${range}.csv"`,
        },
      });
    }
    const stream = csvStreamFromRows(header, rows);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sc-sentinel-${metric}-${range}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return NextResponse.json(
        { error: 'dataset_too_large', message: 'Dataset demasiado grande, filtra por fecha (limit 10000 filas).' },
        { status: 413, headers: noStoreHeaders }
      );
    }
    console.error('Error in /api/export:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
```

(Conservar intactos el parseo de `ExportParamsSchema`, el bloque guest y el `return 501` de `xlsx` de la Task 2.)

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/query/__tests__/export.test.ts lib/export/__tests__/stream.test.ts lib/export/__tests__/csv.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/query/export.ts web/lib/query/__tests__/export.test.ts web/lib/export/stream.ts web/lib/export/__tests__/stream.test.ts web/app/api/export/route.ts
git commit -m "feat(export): stream CSV and enforce 10000 row limit"
```

---

### Task 5: XLSX multi-sheet con Overview, Hosts y Windows (Task 6b)

**Files:**
- Create: `web/lib/export/xlsx.ts`
- Test: `web/lib/export/__tests__/xlsx.test.ts`
- Modify: `web/app/api/export/route.ts` (rama `xlsx` reemplaza el 501)

**Interfaces:**
- Consumes: `queryHostsExport`/`queryAlertsExport`/`queryWindowsExport` (Task 4), `queryOverview`, `buildXlsxBufferMulti(...)` de esta tarea.
- Produces: `buildXlsxBufferMulti(sheets: Record<string, ExportRow[]>): Buffer`, `rowsFromOverview(overview)`, `rowsFromHosts(...)`, `rowsFromAlerts(...)`, `rowsFromWindows(...)`. El route responde `metric=xlsx` como: `hosts` → sheets `Hosts` + `Windows`; `alerts` → sheets `Alerts` + `Windows`; `overview` → sheets `Overview` + `Hosts` + `Windows` (en un solo archivo).

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/export/__tests__/xlsx.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { buildXlsxBufferMulti, rowsFromHosts, rowsFromWindows } from '@/lib/export/xlsx';
import * as XLSX from 'xlsx';

describe('buildXlsxBufferMulti', () => {
  it('genera un workbook con varias hojas legibles', () => {
    const buffer = buildXlsxBufferMulti({
      Overview: [{ metric: 'bytes_in', value: 1000 }],
      Hosts: rowsFromHosts([{ host_key: 'hk_1', ip: null, country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: null, last_seen: null }]),
      Windows: rowsFromWindows([{ window_id: 'w1', start_at: '2026-01-01T00:00:00.000Z', end_at: '2026-01-01T00:00:30.000Z', sequence: 1 }]),
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Overview', 'Hosts', 'Windows']);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['Hosts']!)).toEqual([
      { host_key: 'hk_1', ip: null, country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: 0.9, first_seen: null, last_seen: null },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/export/__tests__/xlsx.test.ts`
Expected: FAIL con `Cannot find module '@/lib/export/xlsx'`.

- [ ] **Step 3: Write minimal implementation**

Instalar la dependencia (una sola vez):
```bash
pnpm add xlsx@^0.18.5
```

```typescript
// web/lib/export/xlsx.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Workbook XLSX multi-sheet desde filas tabulares. Mismos datos que el CSV.
import * as XLSX from 'xlsx';
import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertItem } from '@/lib/query/alerts';
import type { OverviewResult } from '@/lib/query/overview';
import type { ExportWindowItem } from '@/lib/query/export';

export type ExportRow = Record<string, string | number | null>;

export function rowsFromHosts(hosts: HostMetricItem[]): ExportRow[] {
  return hosts.map((host) => ({
    host_key: host.host_key, ip: host.ip, country: host.country,
    bytes_in: host.bytes_in, bytes_out: host.bytes_out, packets: host.packets,
    risk_score: host.risk_score, first_seen: host.first_seen, last_seen: host.last_seen,
  }));
}

export function rowsFromAlerts(alerts: AlertItem[]): ExportRow[] {
  return alerts.map((alert) => ({
    id: alert.id, window_id: alert.window_id, rule_id: alert.rule_id,
    severity: alert.severity, title: alert.title, created_at: alert.created_at,
  }));
}

export function rowsFromWindows(windows: ExportWindowItem[]): ExportRow[] {
  return windows.map((w) => ({
    window_id: w.window_id, start_at: w.start_at, end_at: w.end_at, sequence: w.sequence,
  }));
}

export function rowsFromOverview(overview: OverviewResult): ExportRow[] {
  const t = overview.totals;
  return [
    { metric: 'bytes_in', value: t.bytes_in },
    { metric: 'bytes_out', value: t.bytes_out },
    { metric: 'packets_in', value: t.packets_in },
    { metric: 'packets_out', value: t.packets_out },
    { metric: 'windows_count', value: t.windows_count },
    { metric: 'alerts_count', value: t.alerts_count },
    { metric: 'hosts_count', value: t.hosts_count },
    { metric: 'countries_count', value: t.countries_count },
    { metric: 'risk_avg_score', value: overview.risk.avg_score },
  ];
}

/** Construye el Buffer .xlsx con una hoja por entrada de `sheets`. */
export function buildXlsxBufferMulti(sheets: Record<string, ExportRow[]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
```

En `web/app/api/export/route.ts`, eliminar el bloque `if (format === 'xlsx') { return 501 }` y, antes del bloque CSV, insertar la rama XLSX:

```typescript
    if (format === 'xlsx') {
      const windows = (await queryWindowsExport(range, deviceId)).windows;
      let buffer: Buffer;
      if (metric === 'hosts') {
        buffer = buildXlsxBufferMulti({
          Hosts: rowsFromHosts((await queryHostsExport(range, deviceId)).hosts),
          Windows: rowsFromWindows(windows),
        });
      } else if (metric === 'alerts') {
        buffer = buildXlsxBufferMulti({
          Alerts: rowsFromAlerts((await queryAlertsExport(range, deviceId)).alerts),
          Windows: rowsFromWindows(windows),
        });
      } else {
        const overview = await queryOverview(range, deviceId);
        buffer = buildXlsxBufferMulti({
          Overview: rowsFromOverview(overview),
          Hosts: rowsFromHosts((await queryHostsExport(range, deviceId)).hosts),
          Windows: rowsFromWindows(windows),
        });
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
```

(Imports a añadir: `import { buildXlsxBufferMulti, rowsFromAlerts, rowsFromHosts, rowsFromOverview, rowsFromWindows } from '@/lib/export/xlsx';` y `import { queryAlertsExport, queryHostsExport, queryWindowsExport, ExportTooLargeError } from '@/lib/query/export';`)

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/export/__tests__/xlsx.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/lib/export/xlsx.ts web/lib/export/__tests__/xlsx.test.ts web/app/api/export/route.ts
git commit -m "feat(export): add multi-sheet XLSX downloads"
```

---

### Task 6: Tabla export_logs y logging best-effort (Task 7)

**Files:**
- Create: `web/lib/db/migrations/0008_export-logs.sql`
- Modify: `web/lib/db/migrations/meta/_journal.json` (entrada `idx: 8`)
- Modify: `web/lib/db/schema.ts` (export `exportLogs`)
- Create: `web/lib/export/log.ts`
- Modify: `web/app/api/export/route.ts` (llamar `logExport` tras construir la respuesta)

**Interfaces:**
- Consumes: `db` (`lib/db/index.ts`), `exportLogs` (`lib/db/schema.ts`), `randomUUID` (`node:crypto`).
- Produces: `logExport(input: { role: 'admin'|'guest', deviceId: string | null, metric: string, range: string, format: 'csv'|'xlsx', rowCount: number, bytes: number }): Promise<void>` (nunca lanza).

- [ ] **Step 1: Write the failing check**

Run: `grep -n export_logs web/lib/db/schema.ts || echo SIN_TABLA`
Expected: `SIN_TABLA`.

- [ ] **Step 2: Run check to verify it fails**

Run (desde raíz): `grep -n export_logs web/lib/db/schema.ts || echo SIN_TABLA`
Expected: `SIN_TABLA`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- web/lib/db/migrations/0008_export-logs.sql
-- Auditoría de exportaciones (sin user_id: el repo no tiene tabla de usuarios;
-- se guarda rol + device).
CREATE TABLE "export_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "role" text NOT NULL,
  "device_id" text,
  "metric" text NOT NULL,
  "range" text NOT NULL,
  "format" text NOT NULL,
  "row_count" integer NOT NULL,
  "bytes" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "export_logs_created_idx" ON "export_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX "export_logs_role_idx" ON "export_logs" ("role");
```

`_journal.json`: añadir entrada `idx: 8, tag: "0008_export-logs", when: 1794100000000` (mantener coma de la entrada previa).

En `web/lib/db/schema.ts`, añadir:
```typescript
export const exportLogs = pgTable('export_logs', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  deviceId: text('device_id'),
  metric: text('metric').notNull(),
  range: text('range').notNull(),
  format: text('format').notNull(),
  rowCount: bigint('row_count', { mode: 'number' }).default(0).notNull(),
  bytes: bigint('bytes', { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdIdx: index('export_logs_created_idx').on(table.createdAt),
  roleIdx: index('export_logs_role_idx').on(table.role),
}));
```

```typescript
// web/lib/export/log.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Log de exportaciones best-effort: un fallo aquí nunca rompe la descarga.
import { randomUUID } from 'node:crypto';
import { db, exportLogs } from '@/lib/db';

export interface ExportLogInput {
  role: 'admin' | 'guest';
  deviceId: string | null;
  metric: string;
  range: string;
  format: 'csv' | 'xlsx';
  rowCount: number;
  bytes: number;
}

export async function logExport(input: ExportLogInput): Promise<void> {
  try {
    await db.insert(exportLogs).values({
      id: `exp_${randomUUID()}`,
      role: input.role,
      deviceId: input.deviceId,
      metric: input.metric,
      range: input.range,
      format: input.format,
      rowCount: input.rowCount,
      bytes: input.bytes,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'export_log_failed', error: error instanceof Error ? error.name : 'unknown' }));
  }
}
```

En `web/app/api/export/route.ts`, importar `logExport` y, justo antes de cada `return new NextResponse(...)` de descarga (CSV streaming y XLSX), añadir `void logExport({ role: auth.role, deviceId, metric, range, format, rowCount, bytes: 0 })`. Para CSV `rowCount = rows.length` (o 0 en overview); para XLSX `rowCount` suma hosts/alerts/windows según la rama. `bytes` queda en `0` porque el stream XLSX/CSV se mide tras la respuesta (columna reservada para una futura medición exacta); el dato obligatorio es `rowCount`.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/migrations/0008_export-logs.sql web/lib/db/migrations/meta/_journal.json web/lib/db/schema.ts web/lib/export/log.ts web/app/api/export/route.ts
git commit -m "feat(export): audit exports in export_logs table"
```

---

### Task 7: Dashboard admin /dashboard/admin/exports

**Files:**
- Create: `web/app/api/export/stats/route.ts`
- Create: `web/app/(dashboard)/dashboard/admin/exports/page.tsx`
- Create: `web/components/dashboard/AdminExportsView.tsx`
- Modify: `web/components/dashboard/Sidebar.tsx` (link `Exports`)

**Interfaces:**
- Consumes: `db` + `exportLogs` (Task 6), `authorize(request, { allowGuest: false })`, `fetcher` (`lib/swr.ts`), patrón `getDashboardAuth` + redirect admin de `app/(dashboard)/dashboard/settings/page.tsx`.
- Produces: `GET /api/export/stats` → `{ total, by_role, by_metric, last_created_at, recent: Array<{ role, device_id, metric, range, format, row_count, created_at }> }` (30 días, recientes 50).

- [ ] **Step 1: Write the failing typecheck**

Create `web/app/(dashboard)/dashboard/admin/exports/page.tsx` con solo:
```tsx
import { AdminExportsView } from '@/components/dashboard/AdminExportsView';
export default function AdminExportsPage() {
  return <AdminExportsView />;
}
```
Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module '@/components/dashboard/AdminExportsView'`.

- [ ] **Step 2: Run typecheck to verify it fails**

Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module '@/components/dashboard/AdminExportsView'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/app/api/export/stats/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Agregados de export_logs para el dashboard admin. Solo admin.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { authorize } from '@/lib/auth/resolve';
import { db, exportLogs } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const totals = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`);
  const byRole = await db
    .select({ role: exportLogs.role, total: sql<number>`COUNT(*)::int` })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .groupBy(exportLogs.role);
  const byMetric = await db
    .select({ metric: exportLogs.metric, total: sql<number>`COUNT(*)::int`, rows: sql<number>`COALESCE(SUM(row_count),0)::bigint` })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .groupBy(exportLogs.metric);
  const recent = await db
    .select({ role: exportLogs.role, device_id: exportLogs.deviceId, metric: exportLogs.metric, range: exportLogs.range, format: exportLogs.format, row_count: exportLogs.rowCount, created_at: exportLogs.createdAt })
    .from(exportLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .orderBy(sql`created_at DESC`)
    .limit(50);

  return NextResponse.json(
    {
      total: Number(totals[0]?.total ?? 0),
      by_role: byRole.map((r) => ({ role: r.role, total: Number(r.total) })),
      by_metric: byMetric.map((m) => ({ metric: m.metric, total: Number(m.total), rows: Number(m.rows) })),
      recent: recent.map((r) => ({
        role: r.role, device_id: r.device_id, metric: r.metric, range: r.range, format: r.format,
        row_count: Number(r.row_count), created_at: r.created_at ? r.created_at.toISOString() : null,
      })),
    },
    { headers: noStoreHeaders }
  );
}
```

```tsx
// web/components/dashboard/AdminExportsView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { TriangleAlert } from 'lucide-react';
import { fetcher, FetchError } from '@/lib/swr';

interface Stats {
  total: number;
  by_role: Array<{ role: string; total: number }>;
  by_metric: Array<{ metric: string; total: number; rows: number }>;
  recent: Array<{ role: string; device_id: string | null; metric: string; range: string; format: string; row_count: number; created_at: string | null }>;
}

export function AdminExportsView() {
  const { data, error } = useSWR<Stats>('/api/export/stats', fetcher, { refreshInterval: 5000 });
  const sessionExpired = error instanceof FetchError && error.status === 401;
  if (sessionExpired) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">Tu sesión expiró</h2>
        <Link href="/login" className="mt-6 inline-flex items-center justify-center rounded-lg border border-sky-400/40 bg-sky-400/10 px-5 py-2.5 font-display text-sm font-semibold text-sky-400">Volver a entrar</Link>
      </div>
    );
  }
  if (!data) return <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-400">Cargando exportaciones…</div>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Exports (30 días)</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{data.total}</p>
        </div>
        {data.by_role.map((r) => (
          <div key={r.role} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">{r.role}</p>
            <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{r.total}</p>
          </div>
        ))}
      </div>
      <table className="w-full overflow-hidden rounded-xl border border-slate-800 text-sm">
        <thead className="bg-slate-900/80 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
          <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Métrica</th><th className="px-4 py-3">Formato</th><th className="px-4 py-3">Filas</th><th className="px-4 py-3">Rol</th></tr>
        </thead>
        <tbody>
          {data.recent.map((r, i) => (
            <tr key={`${r.created_at}-${i}`} className="border-t border-slate-800 text-slate-300">
              <td className="px-4 py-3 font-mono text-xs">{r.created_at ?? '—'}</td>
              <td className="px-4 py-3">{r.metric}</td>
              <td className="px-4 py-3">{r.format}</td>
              <td className="px-4 py-3">{r.row_count}</td>
              <td className="px-4 py-3">{r.role}</td>
            </tr>
          ))}
          {data.recent.length === 0 && (
            <tr className="border-t border-slate-800 text-slate-400"><td className="px-4 py-3" colSpan={5}>Sin exportaciones en los últimos 30 días.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

```tsx
// web/app/(dashboard)/dashboard/admin/exports/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminExportsView } from '@/components/dashboard/AdminExportsView';
import { getDashboardAuth } from '@/lib/auth/dashboard';

export const metadata: Metadata = {
  title: 'Exports · SC-Sentinel',
  description: 'Uso de exportaciones: conteos por rol y métrica en los últimos 30 días.',
};

export default async function AdminExportsPage() {
  const auth = await getDashboardAuth();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/dashboard/overview');
  return <AdminExportsView />;
}
```

En `web/components/dashboard/Sidebar.tsx`, añadir al array de navegación `{ href: '/dashboard/admin/exports', label: 'Exports', icon: BarChart3 }` (`BarChart3` de `lucide-react`) siguiendo el formato existente.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/export/stats/route.ts web/app/\(dashboard\)/dashboard/admin/exports/page.tsx web/components/dashboard/AdminExportsView.tsx web/components/dashboard/Sidebar.tsx
git commit -m "feat(export): add admin exports usage view"
```

---

### Task 8: Instrumentar proveedores para capturar métricas completas (Task 8b)

**Files:**
- Modify: `web/lib/ai/openrouter.ts:47-55` (interface) y `callOpenRouterChain` (retorno)
- Modify: `web/lib/ai/providers.ts` (Gemini/Groq + `callAiChain` propaga usage)
- Create: `web/lib/ai/metrics.ts`
- Test: `web/lib/ai/__tests__/metrics.test.ts`

**Interfaces:**
- Consumes: Tipos `GeminiResponseLike.usageMetadata` y `GroqResponseLike.usage` (ya presentes en `providers.ts`), `payload.usage` de OpenRouter (`openrouter.ts:196`).
- Produces: `AiCallMetrics { inputTokens: number|null, outputTokens: number|null, latencyMs: number, statusCode: number }`, `parsePricing(env): Record<string, { inputPerMTok: number, outputPerMTok: number }>`, `estimateCostUsd(model, inputTokens, outputTokens, pricing): number`. `AiChainResult` gana `usage: AiCallMetrics | null`. `cost_usd` no se calcula en el proveedor: se calcula en `analyze.ts` con `estimateCostUsd` para no mezclar pricing con SDKs.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/ai/__tests__/metrics.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { estimateCostUsd, parsePricing } from '@/lib/ai/metrics';

describe('parsePricing', () => {
  it('parsea AI_PRICING_JSON y tolera entradas inválidas', () => {
    const pricing = parsePricing({ AI_PRICING_JSON: '{"m1":{"inputPerMTok":0.15,"outputPerMTok":0.60},"bad":null}' } as Record<string, string>);
    expect(pricing['m1']).toEqual({ inputPerMTok: 0.15, outputPerMTok: 0.6 });
    expect(pricing['bad']).toBeUndefined();
  });
  it('devuelve vacío sin env o con JSON inválido', () => {
    expect(parsePricing({})).toEqual({});
    expect(parsePricing({ AI_PRICING_JSON: 'no-json' })).toEqual({});
  });
});

describe('estimateCostUsd', () => {
  it('calcula coste por millón de tokens', () => {
    expect(estimateCostUsd('m1', 1_000_000, 500_000, { m1: { inputPerMTok: 0.15, outputPerMTok: 0.6 } })).toBeCloseTo(0.45, 6);
  });
  it('devuelve 0 para modelos free o sin precio', () => {
    expect(estimateCostUsd('openrouter/free', 1000, 1000, {})).toBe(0);
    expect(estimateCostUsd('m1', null, null, { m1: { inputPerMTok: 1, outputPerMTok: 1 } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/ai/__tests__/metrics.test.ts`
Expected: FAIL con `Cannot find module '@/lib/ai/metrics'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/ai/metrics.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Utilidades de métricas/coste de IA. Los proveedores ya reportan tokens y
// latencia (ver logAiCall); aquí se tipan y se estima el coste.

export interface AiCallMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  statusCode: number;
}

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export type PricingTable = Record<string, ModelPricing>;

/** Tabla de precios desde AI_PRICING_JSON: {"modelo":{"inputPerMTok":0.15,"outputPerMTok":0.60}} */
export function parsePricing(env: Record<string, string | undefined> = process.env): PricingTable {
  const raw = env['AI_PRICING_JSON'];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const table: PricingTable = {};
    for (const [model, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const candidate = value as { inputPerMTok?: unknown; outputPerMTok?: unknown };
      const input = Number(candidate.inputPerMTok);
      const output = Number(candidate.outputPerMTok);
      if (Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) {
        table[model] = { inputPerMTok: input, outputPerMTok: output };
      }
    }
    return table;
  } catch {
    return {};
  }
}

/** Coste en USD; 0 si el modelo no tiene precio (free) o faltan conteos. */
export function estimateCostUsd(model: string, inputTokens: number | null, outputTokens: number | null, pricing: PricingTable): number {
  const entry = pricing[model];
  if (!entry || inputTokens === null || outputTokens === null) return 0;
  return (inputTokens / 1_000_000) * entry.inputPerMTok + (outputTokens / 1_000_000) * entry.outputPerMTok;
}
```

En `web/lib/ai/openrouter.ts`, reemplazar la interface `AiChainResult` (líneas 47-55) por:

```typescript
export interface AiChainResult {
  ok: boolean;
  model: string | null;
  output: AiOutput | null;
  /** Métricas de la llamada ganadora (null si falló sin respuesta o en fallback determinista). */
  usage: { inputTokens: number | null; outputTokens: number | null; latencyMs: number; statusCode: number } | null;
  /** true si el intento falló por 429: el proveedor debe entrar en cooldown. */
  rateLimited?: boolean;
  /** `Retry-After` reportado por el proveedor (segundos), si venía. */
  retryAfterSeconds?: number | null;
}
```

Y en `callOpenRouterChain`, reemplazar los retornos `return { ok: false, model: null, output: null };` por `return { ok: false, model: null, output: null, usage: null };` (3 sitios: `!apiKey`, `!content`, `!validated.success` es `break` no retorno — el retorno final de error tras el loop es el 4º sitio) y el éxito por:

```typescript
        logAiCall({
          provider: 'openrouter',
          model: usedModel,
          ok: true,
          input_tokens: payload.usage?.prompt_tokens ?? null,
          output_tokens: payload.usage?.completion_tokens ?? null,
          latency_ms: Date.now() - attemptStartedAt,
        });
        return {
          ok: true, model: usedModel, output: validated.data,
          usage: {
            inputTokens: payload.usage?.prompt_tokens ?? null,
            outputTokens: payload.usage?.completion_tokens ?? null,
            latencyMs: Date.now() - attemptStartedAt,
            statusCode: res.status,
          },
        };
```

Y el `return` final de error tras el loop por `return { ok: false, model: null, output: null, usage: null, rateLimited, retryAfterSeconds };`.

En `web/lib/ai/providers.ts`:
- En `callGeminiChain`, reemplazar el éxito por:
```typescript
        logAiCall({ provider: 'gemini', model, ok: true, input_tokens: response.usageMetadata?.promptTokenCount ?? null, output_tokens: response.usageMetadata?.candidatesTokenCount ?? null, latency_ms: Date.now() - attemptStartedAt });
        return {
          ok: true, model, output: validated.data,
          usage: { inputTokens: response.usageMetadata?.promptTokenCount ?? null, outputTokens: response.usageMetadata?.candidatesTokenCount ?? null, latencyMs: Date.now() - attemptStartedAt, statusCode: 200 },
        };
```
- En `callGroqChain`, reemplazar el éxito por:
```typescript
        logAiCall({ provider: 'groq', model: usedModel, ok: true, input_tokens: completion.usage?.prompt_tokens ?? null, output_tokens: completion.usage?.completion_tokens ?? null, latency_ms: Date.now() - attemptStartedAt });
        return {
          ok: true, model: usedModel, output: validated.data,
          usage: { inputTokens: completion.usage?.prompt_tokens ?? null, outputTokens: completion.usage?.completion_tokens ?? null, latencyMs: Date.now() - attemptStartedAt, statusCode: 200 },
        };
```
- Reemplazar los 4 retornos de fallo (`missing_api_key`, `empty_content` no retorna, `final`) de ambos: `return { ok: false, model: null, output: null };` → `return { ok: false, model: null, output: null, usage: null };` y el final de `callAiChain` de `return { ok: false, model: null, output: null, rateLimited, retryAfterSeconds };` se mantiene (ya incluye `usage: null` implícito si se añade; añadir `usage: null` para satisfacer el tipo).

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/ai/__tests__/metrics.test.ts lib/ai/__tests__/routing.test.ts lib/ai/__tests__/providers.test.ts && pnpm typecheck`
Expected: PASS. Nota: `routing.test.ts`/`providers.test.ts` (ya existentes) usan fixtures sin `usageMetadata`/`usage`; el código debe devolver `usage: { inputTokens: null, ... }` o `usage: null` según el caso, sin romper esos tests.

- [ ] **Step 5: Commit**

```bash
git add web/lib/ai/metrics.ts web/lib/ai/__tests__/metrics.test.ts web/lib/ai/openrouter.ts web/lib/ai/providers.ts
git commit -m "feat(evals): capture tokens, latency and status from AI providers"
```

---

### Task 9: Migración 0009 y persistencia de métricas (Task 9b)

**Files:**
- Create: `web/lib/db/migrations/0009_ai-evals-metrics.sql`
- Modify: `web/lib/db/migrations/meta/_journal.json` (entrada `idx: 9`)
- Modify: `web/lib/db/schema.ts` (campos en `aiInsights`)
- Modify: `web/lib/ai/analyze.ts:281-304` (INSERT con métricas + alerta de coste)

**Interfaces:**
- Consumes: Task 8 (`AiChainResult.usage`, `parsePricing`, `estimateCostUsd`), `aiInsights` existente (`schema.ts:110-127`), `runAnalysisPipeline` (`analyze.ts:219`).
- Produces: columnas `input_tokens`, `output_tokens`, `cost_usd numeric(12,6) DEFAULT 0`, `latency_ms`, `status_code`; `AiInsightRecord` gana `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `status_code` (nullables para filas viejas). `runAnalysisPipeline` calcula `costUsd = estimateCostUsd(model, usage?.inputTokens ?? null, usage?.outputTokens ?? null, parsePricing())` y persiste.

- [ ] **Step 1: Write the failing check**

Run: `grep -n input_tokens web/lib/db/schema.ts || echo SIN_METRICAS`
Expected: `SIN_METRICAS`.

- [ ] **Step 2: Run check to verify it fails**

Run (desde raíz): `grep -n input_tokens web/lib/db/schema.ts || echo SIN_METRICAS`
Expected: `SIN_METRICAS`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- web/lib/db/migrations/0009_ai-evals-metrics.sql
-- Métricas de la llamada IA que generó cada insight (null en filas viejas).
ALTER TABLE "ai_insights" ADD COLUMN "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "cost_usd" numeric(12,6) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "latency_ms" integer;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "status_code" smallint;
--> statement-breakpoint
CREATE INDEX "ai_insights_created_idx" ON "ai_insights" ("created_at");
```

`_journal.json`: añadir `idx: 9, tag: "0009_ai-evals-metrics", when: 1794200000000`.

En `web/lib/db/schema.ts`, en `aiInsights` (líneas 110-127), añadir tras `factsHash`:
```typescript
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).default('0').notNull(),
  latencyMs: integer('latency_ms'),
  statusCode: integer('status_code'),
```
(Importar `integer` y `numeric` de `drizzle-orm/pg-core` en la línea 1.)

En `web/lib/ai/analyze.ts`:
- Importar `import { estimateCostUsd, parsePricing } from './metrics';` y `import { maybeAlertCost } from './cost-alert';` (este segundo módulo se crea en la Task 11; para no romper el build en esta tarea, crear ya `web/lib/ai/cost-alert.ts` con solo la función log+webhook descrita en la Task 11 y sin el chequeo de coste diario; el chequeo completo se añade en la Task 11).
- Extender la interface `AiInsightRecord` con:
```typescript
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number;
  latency_ms: number | null;
  status_code: number | null;
```
- Extender `InsightRow` con `input_tokens: number | null; output_tokens: number | null; cost_usd: string | number | null; latency_ms: number | null; status_code: number | null;` y `mapInsightRow` con:
```typescript
    input_tokens: row.input_tokens ?? null,
    output_tokens: row.output_tokens ?? null,
    cost_usd: Number(row.cost_usd ?? 0),
    latency_ms: row.latency_ms ?? null,
    status_code: row.status_code ?? null,
```
- Reemplazar el bloque `const chain = await callAiChain(...)` + `const id = ...` + `await database.execute(...)` (líneas 276-304) por:
```typescript
  const chain = await callAiChain(facts, { language });
  const output = chain.ok && chain.output ? chain.output : buildDegradedOutput(language);
  const model = chain.ok && chain.model ? chain.model : 'deterministic-fallback';
  const status: AnalysisStatus = chain.ok ? 'ok' : 'degraded';
  const usage = chain.ok ? chain.usage : null;
  const costUsd = estimateCostUsd(model, usage?.inputTokens ?? null, usage?.outputTokens ?? null, parsePricing());

  const id = `ins_${randomUUID()}`;
  const recommendationsJson = { findings: output.findings, recommendations: output.recommendations };

  await database.execute(
    sql`INSERT INTO ai_insights
          (id, device_id, period_start, period_end, model, status, language, risk_level, summary,
           recommendations_json, facts_hash, input_tokens, output_tokens, cost_usd, latency_ms, status_code)
        VALUES (
          ${id}, ${deviceId}, ${facts.period.start}::timestamptz, ${facts.period.end}::timestamptz,
          ${model}, ${status}, ${language}, ${output.risk_level}, ${output.summary},
          ${JSON.stringify(recommendationsJson)}::jsonb, ${hash},
          ${usage?.inputTokens ?? null}, ${usage?.outputTokens ?? null}, ${costUsd},
          ${usage?.latencyMs ?? null}, ${usage?.statusCode ?? null}
        )`
  );
  await maybeAlertCost(database);
```

Archivo mínimo `web/lib/ai/cost-alert.ts` (se completa en Task 11):
```typescript
// web/lib/ai/cost-alert.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Alerta de coste diario: log estructurado + webhook opcional. Sin email.
import type { QueryDb } from '@/lib/query/db-rows';

export async function maybeAlertCost(_database: QueryDb): Promise<void> {
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm vitest run lib/ai/__tests__/analyze.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/migrations/0009_ai-evals-metrics.sql web/lib/db/migrations/meta/_journal.json web/lib/db/schema.ts web/lib/ai/analyze.ts web/lib/ai/cost-alert.ts
git commit -m "feat(evals): persist tokens, cost, latency and status per insight"
```

---

### Task 10: Consulta metric=evals v2 con series para gráficos

**Files:**
- Create: `web/lib/query/evals.ts` (v2 completo, reemplaza el diseño simple de v1)
- Test: `web/lib/query/__tests__/evals.test.ts`
- Modify: `web/lib/schemas/query.ts:6` (agregar `'evals'`)
- Modify: `web/lib/api-types.ts` (espejo v2)
- Modify: `web/app/api/query/route.ts` (caso `evals`)

**Interfaces:**
- Consumes: `queryRows` + `QueryDb` (`lib/query/db-rows.ts`), columnas nuevas de la Task 9.
- Produces: `queryEvals(deviceId?: string | null, database?: QueryDb): Promise<EvalsResponse>` con:
```typescript
{
  total: number; ok: number; degraded: number; cached: number; no_data: number;
  degraded_rate: number; success_rate: number; // ok / (ok + degraded + no_data), 0 si denom 0
  total_cost_usd: number; latest_created_at: string | null;
  by_model: Array<{ model: string; total: number; ok: number; degraded: number; degraded_rate: number; input_tokens: number; output_tokens: number; avg_latency_ms: number }>;
  daily_cost: Array<{ date: string; cost_usd: number; insights: number }>;
  latency: Array<{ date: string; p50_ms: number; p95_ms: number }>;
}
```
Sin `deviceId` devuelve el objeto vacío (sin tocar la base).

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/query/__tests__/evals.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { percentile, queryEvals } from '@/lib/query/evals';
import type { QueryDb } from '@/lib/query/db-rows';
import type { SQL } from 'drizzle-orm';

function fakeDb(rows: unknown[]): QueryDb {
  return { execute: (_query: SQL) => Promise.resolve({ rows }) };
}

describe('percentile', () => {
  it('calcula p50 y p95 por rango más cercano', () => {
    expect(percentile([100, 200, 300, 400], 50)).toBe(200);
    expect(percentile([100, 200, 300, 400], 95)).toBe(400);
    expect(percentile([], 50)).toBe(0);
  });
});

describe('queryEvals', () => {
  it('devuelve vacío sin device_id sin tocar la base', async () => {
    const failing: QueryDb = { execute: () => Promise.reject(new Error('no debe llamar')) };
    await expect(queryEvals(null, failing)).resolves.toMatchObject({ total: 0, total_cost_usd: 0, daily_cost: [], latency: [] });
  });
  it('agrega filas con métricas', async () => {
    const result = await queryEvals('dev_1', fakeDb([
      { id: '1', device_id: 'dev_1', period_start: '2026-01-01T00:00:00.000Z', period_end: '2026-01-01T01:00:00.000Z', model: 'm', status: 'ok', language: 'es', risk_level: 'low', summary: 's', recommendations_json: { findings: [], recommendations: [] }, facts_hash: 'h1', created_at: '2026-01-01T01:00:00.000Z', input_tokens: 1000, output_tokens: 500, cost_usd: '0.10', latency_ms: 2000, status_code: 200 },
      { id: '2', device_id: 'dev_1', period_start: '2026-01-01T00:00:00.000Z', period_end: '2026-01-01T01:00:00.000Z', model: 'm', status: 'degraded', language: 'es', risk_level: 'low', summary: 's', recommendations_json: { findings: [], recommendations: [] }, facts_hash: 'h2', created_at: '2026-01-01T02:00:00.000Z', input_tokens: null, output_tokens: null, cost_usd: '0', latency_ms: null, status_code: null },
    ]));
    expect(result).toMatchObject({ total: 2, ok: 1, degraded: 1, total_cost_usd: 0.1 });
    expect(result.by_model[0]).toMatchObject({ model: 'm', input_tokens: 1000, output_tokens: 500 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/query/__tests__/evals.test.ts`
Expected: FAIL con `Cannot find module '@/lib/query/evals'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/query/evals.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Agregación de evals sobre ai_insights (últimos 30 días). Sin migración
// adicional: lee las columnas de la Task 9.
import { sql } from 'drizzle-orm';
import { defaultQueryDb, queryRows, type QueryDb } from './db-rows';

export interface EvalsByModel {
  model: string; total: number; ok: number; degraded: number;
  degraded_rate: number; input_tokens: number; output_tokens: number; avg_latency_ms: number;
}
export interface EvalsDailyCost { date: string; cost_usd: number; insights: number }
export interface EvalsLatencyPoint { date: string; p50_ms: number; p95_ms: number }
export interface EvalsResponse {
  total: number; ok: number; degraded: number; cached: number; no_data: number;
  degraded_rate: number; success_rate: number; total_cost_usd: number;
  latest_created_at: string | null;
  by_model: EvalsByModel[];
  daily_cost: EvalsDailyCost[];
  latency: EvalsLatencyPoint[];
}

interface InsightRow {
  id: string; device_id: string; period_start: Date | string; period_end: Date | string;
  model: string; status: string; language: string | null; risk_level: string | null;
  summary: string; recommendations_json: unknown; facts_hash: string;
  created_at: Date | string;
  input_tokens: number | null; output_tokens: number | null;
  cost_usd: string | number | null; latency_ms: number | null; status_code: number | null;
}

/** Percentil por rango más cercano; 0 con lista vacía. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))]!;
}

function emptyEvals(): EvalsResponse {
  return { total: 0, ok: 0, degraded: 0, cached: 0, no_data: 0, degraded_rate: 0, success_rate: 0, total_cost_usd: 0, latest_created_at: null, by_model: [], daily_cost: [], latency: [] };
}

export async function queryEvals(deviceId?: string | null, database: QueryDb = defaultQueryDb): Promise<EvalsResponse> {
  if (!deviceId) return emptyEvals();
  const rows = await queryRows<InsightRow>(
    database,
    sql`SELECT id, device_id, period_start, period_end, model, status, language, risk_level, summary,
               recommendations_json, facts_hash, created_at, input_tokens, output_tokens, cost_usd, latency_ms, status_code
        FROM ai_insights
        WHERE device_id = ${deviceId}
          AND created_at > (NOW() - INTERVAL '30 days')
        ORDER BY created_at DESC`
  );
  let ok = 0, degraded = 0, cached = 0, noData = 0, totalCost = 0;
  let latest: string | null = null;
  const byModel = new Map<string, EvalsByModel & { latencies: number[] }>();
  const byDay = new Map<string, { cost: number; count: number; latencies: number[] }>();

  for (const row of rows) {
    if (row.status === 'ok') ok += 1;
    else if (row.status === 'degraded') degraded += 1;
    else if (row.status === 'cached') cached += 1;
    else noData += 1;
    const cost = Number(row.cost_usd ?? 0);
    totalCost += cost;
    const created = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(String(row.created_at)).toISOString();
    if (latest === null || created > latest) latest = created;
    const date = created.slice(0, 10);
    const day = byDay.get(date) ?? { cost: 0, count: 0, latencies: [] };
    day.cost += cost; day.count += 1;
    if (row.latency_ms !== null && row.latency_ms !== undefined) day.latencies.push(row.latency_ms);
    byDay.set(date, day);

    const entry = byModel.get(row.model) ?? { model: row.model, total: 0, ok: 0, degraded: 0, degraded_rate: 0, input_tokens: 0, output_tokens: 0, avg_latency_ms: 0, latencies: [] };
    entry.total += 1;
    if (row.status === 'ok') entry.ok += 1;
    if (row.status === 'degraded') entry.degraded += 1;
    entry.input_tokens += row.input_tokens ?? 0;
    entry.output_tokens += row.output_tokens ?? 0;
    if (row.latency_ms !== null && row.latency_ms !== undefined) entry.latencies.push(row.latency_ms);
    byModel.set(row.model, entry);
  }

  const total = rows.length;
  const denom = ok + degraded + noData;
  const dailyCost = Array.from(byDay, ([date, v]) => ({ date, cost_usd: v.cost, insights: v.count })).sort((a, b) => a.date.localeCompare(b.date));
  const latency = Array.from(byDay, ([date, v]) => ({ date, p50_ms: percentile(v.latencies, 50), p95_ms: percentile(v.latencies, 95) })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    total, ok, degraded, cached, no_data: noData,
    degraded_rate: total === 0 ? 0 : degraded / total,
    success_rate: denom === 0 ? 0 : ok / denom,
    total_cost_usd: totalCost,
    latest_created_at: latest,
    by_model: Array.from(byModel.values(), (e) => ({
      model: e.model, total: e.total, ok: e.ok, degraded: e.degraded,
      degraded_rate: e.total === 0 ? 0 : e.degraded / e.total,
      input_tokens: e.input_tokens, output_tokens: e.output_tokens,
      avg_latency_ms: e.latencies.length === 0 ? 0 : e.latencies.reduce((a, b) => a + b, 0) / e.latencies.length,
    })).sort((a, b) => b.total - a.total || a.model.localeCompare(b.model)),
    daily_cost: dailyCost,
    latency,
  };
}
```

En `web/lib/schemas/query.ts` línea 6, reemplazar el enum por `metric: z.enum(['overview', 'hosts', 'alerts', 'health', 'ai', 'evals']),`.
En `web/lib/api-types.ts`, añadir `EvalsByModel`, `EvalsDailyCost`, `EvalsLatencyPoint`, `EvalsResponse` espejo de las interfaces anteriores (idénticas claves).
En `web/app/api/query/route.ts`, añadir `import { queryEvals } from '@/lib/query/evals';` y el caso:
```typescript
      case 'evals':
        return NextResponse.json(await queryEvals(deviceId), { status: 200, headers: noStoreHeaders });
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/query/__tests__/evals.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/query/evals.ts web/lib/query/__tests__/evals.test.ts web/lib/schemas/query.ts web/lib/api-types.ts web/app/api/query/route.ts
git commit -m "feat(evals): aggregate cost, tokens and latency over 30 days"
```

---

### Task 11: Dashboard Evals con gráficos y alerta de coste (Tasks 10b + 11)

**Files:**
- Create: `web/app/(dashboard)/dashboard/evals/page.tsx`
- Create: `web/components/dashboard/EvalsView.tsx`
- Modify: `web/components/dashboard/Sidebar.tsx` (link `Evals de IA`)
- Modify: `web/lib/ai/cost-alert.ts` (chequeo real)

**Interfaces:**
- Consumes: `EvalsResponse` v2 (Task 10), `fetcher` (`lib/swr.ts`), `recharts` (`LineChart`, `BarChart`, `PieChart`).
- Produces: ruta `/dashboard/evals` con tarjetas totales, línea coste/día, barras tokens/modelo, línea p50/p95, donut éxito/fallo. `maybeAlertCost(database)`: suma `cost_usd` de hoy (UTC, todos los devices); umbral `AI_DAILY_COST_ALERT_USD` (default 10); si supera, `console.log` estructurado `ai_cost_alert` y, si existe `AI_COST_ALERT_WEBHOOK_URL`, `POST {type: 'ai_cost_alert', cost_usd, threshold_usd}` con timeout 5s (best-effort).

- [ ] **Step 1: Write the failing typecheck**

Create `web/app/(dashboard)/dashboard/evals/page.tsx` con solo:
```tsx
import { EvalsView } from '@/components/dashboard/EvalsView';
export default function EvalsPage() { return <EvalsView />; }
```
Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module '@/components/dashboard/EvalsView'`.

- [ ] **Step 2: Run typecheck to verify it fails**

Run (desde `web/`): `pnpm typecheck`
Expected: FAIL con `Cannot find module '@/components/dashboard/EvalsView'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web/app/(dashboard)/dashboard/evals/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { EvalsView } from '@/components/dashboard/EvalsView';

export const metadata: Metadata = {
  title: 'Evals de IA · SC-Sentinel',
  description: 'Coste, tokens y latencia de los análisis de IA en los últimos 30 días.',
};

export default function EvalsPage() {
  return <EvalsView />;
}
```

```tsx
// web/components/dashboard/EvalsView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Dashboard de evals: coste/día, tokens/modelo, latencia p50/p95, éxito/fallo.
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TriangleAlert } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { EvalsResponse } from '@/lib/api-types';
import { fetcher, FetchError } from '@/lib/swr';

const REFRESH_MS = 5000;
const COLORS = ['#34d399', '#fbbf24', '#38bdf8'];

export function EvalsView() {
  const { data, error } = useSWR<EvalsResponse>('/api/query?metric=evals', fetcher, { refreshInterval: REFRESH_MS });
  const sessionExpired = error instanceof FetchError && error.status === 401;
  if (sessionExpired) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">Tu sesión expiró</h2>
        <Link href="/login" className="mt-6 inline-flex items-center justify-center rounded-lg border border-sky-400/40 bg-sky-400/10 px-5 py-2.5 font-display text-sm font-semibold text-sky-400">Volver a entrar</Link>
      </div>
    );
  }
  if (!data) return <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-400">Cargando evals…</div>;

  const tokensByModel = data.by_model.map((m) => ({ model: m.model, tokens: m.input_tokens + m.output_tokens }));
  const donut = [
    { name: 'OK', value: data.ok },
    { name: 'Degraded', value: data.degraded },
    { name: 'Sin datos', value: data.no_data },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Coste (30 días)</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">${data.total_cost_usd.toFixed(4)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Total</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{data.total}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Tasa de éxito</p>
          <p className="mt-2 font-display text-2xl font-semibold text-emerald-300">{(data.success_rate * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Tasa degraded</p>
          <p className="mt-2 font-display text-2xl font-semibold text-amber-300">{(data.degraded_rate * 100).toFixed(1)}%</p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-label="Coste por día">
        <h2 className="font-display text-base font-semibold text-slate-100">Coste acumulado por día</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <LineChart data={data.daily_cost}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="cost_usd" stroke="#38bdf8" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-label="Tokens por modelo">
          <h2 className="font-display text-base font-semibold text-slate-100">Tokens usados por modelo</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <BarChart data={tokensByModel}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="model" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Bar dataKey="tokens" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-label="Éxito y fallo">
          <h2 className="font-display text-base font-semibold text-slate-100">Éxito / fallo</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} label>
                  {donut.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-label="Latencia">
        <h2 className="font-display text-base font-semibold text-slate-100">Latencia p50 / p95 (ms)</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <LineChart data={data.latency}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="p50_ms" stroke="#34d399" dot={false} />
              <Line type="monotone" dataKey="p95_ms" stroke="#fbbf24" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <p className="font-mono text-xs text-slate-500">Último análisis: {data.latest_created_at ?? '—'}</p>
    </div>
  );
}
```

Reemplazar `web/lib/ai/cost-alert.ts` por:
```typescript
// web/lib/ai/cost-alert.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Alerta de coste diario: log estructurado + webhook opcional (sin email).
import { sql } from 'drizzle-orm';
import { queryRows, type QueryDb } from '@/lib/query/db-rows';

function thresholdUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseFloat(env.AI_DAILY_COST_ALERT_USD ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

export async function maybeAlertCost(database: QueryDb): Promise<void> {
  try {
    const today = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const rows = await queryRows<{ total: string }>(
      database,
      sql`SELECT COALESCE(SUM(cost_usd), 0)::text AS total FROM ai_insights WHERE created_at >= ${today}::timestamptz`
    );
    const cost = Number(rows[0]?.total ?? 0);
    const threshold = thresholdUsd();
    if (!Number.isFinite(cost) || cost <= threshold) return;
    console.log(JSON.stringify({ event: 'ai_cost_alert', cost_usd: cost, threshold_usd: threshold }));
    const webhook = process.env.AI_COST_ALERT_WEBHOOK_URL;
    if (webhook) {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ai_cost_alert', cost_usd: cost, threshold_usd: threshold }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => undefined);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'ai_cost_alert_failed', error: error instanceof Error ? error.name : 'unknown' }));
  }
}
```

En `web/components/dashboard/Sidebar.tsx`, añadir `{ href: '/dashboard/evals', label: 'Evals de IA', icon: BarChart3 }`.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/\(dashboard\)/dashboard/evals/page.tsx web/components/dashboard/EvalsView.tsx web/lib/ai/cost-alert.ts web/components/dashboard/Sidebar.tsx
git commit -m "feat(evals): add cost and latency charts with cost alerts"
```

---

### Task 12: Migración trust_pages con seguridad (Task 12b)

**Files:**
- Create: `web/lib/db/migrations/0010_trust-pages.sql`
- Modify: `web/lib/db/migrations/meta/_journal.json` (entrada `idx: 10`)
- Modify: `web/lib/db/schema.ts` (export `trustPages`)

**Interfaces:**
- Consumes: patrón `devices` (`schema.ts:3-10`, token como hash único).
- Produces: `trust_pages (id PK, device_id FK → devices ON DELETE CASCADE, token_hash UNIQUE, label, created_at, revoked_at, expires_at, last_rotated_at)` + índices.

- [ ] **Step 1: Write the failing check**

Run: `grep -n trust_pages web/lib/db/schema.ts || echo SIN_TABLA`
Expected: `SIN_TABLA`.

- [ ] **Step 2: Run check to verify it fails**

Run (desde raíz): `grep -n trust_pages web/lib/db/schema.ts || echo SIN_TABLA`
Expected: `SIN_TABLA`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- web/lib/db/migrations/0010_trust-pages.sql
CREATE TABLE "trust_pages" (
  "id" text PRIMARY KEY NOT NULL,
  "device_id" text NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "label" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  "expires_at" timestamptz,
  "last_rotated_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trust_pages_token_hash_idx" ON "trust_pages" ("token_hash");
--> statement-breakpoint
CREATE INDEX "trust_pages_device_idx" ON "trust_pages" ("device_id");
```

`_journal.json`: añadir `idx: 10, tag: "0010_trust-pages", when: 1794300000000`.

En `web/lib/db/schema.ts`, añadir:
```typescript
export const trustPages = pgTable('trust_pages', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
}, (table) => ({
  deviceIdx: index('trust_pages_device_idx').on(table.deviceId),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/migrations/0010_trust-pages.sql web/lib/db/migrations/meta/_journal.json web/lib/db/schema.ts
git commit -m "feat(trust): add trust_pages table with expiry and rotation fields"
```

---

### Task 13: API de Trust Pages con rotación (Tasks 13b + 14b)

**Files:**
- Create: `web/lib/trust/token.ts`
- Test: `web/lib/trust/__tests__/token.test.ts`
- Create: `web/lib/trust/queries.ts`
- Test: `web/lib/trust/__tests__/queries-import.test.ts`
- Create: `web/app/api/trust/route.ts`
- Create: `web/app/api/trust/[id]/rotate/route.ts`

**Interfaces:**
- Consumes: `db` + `trustPages` + `devices` (Task 12), `authorize(request, { allowGuest: false })`.
- Produces: `generateTrustToken()`, `hashTrustToken(token)`, `trustTokensMatch(hash, token)`, `createTrustPage(deviceId, label?, expiresAt?)`, `listTrustPages()`, `revokeTrustPage(id)`, `rotateTrustPage(id)` (nuevo token, anterior inválido inmediato, `last_rotated_at = now()`), `resolveTrustPage(token)` → `{ device_id, label } | null` (null si ausente, revocado o `expires_at < now()`). Endpoints: `GET /api/trust`, `POST /api/trust`, `DELETE /api/trust?id=`, `POST /api/trust/[id]/rotate`. Todos admin; guest recibe 403; el token en claro solo viaja en la respuesta de `POST` (crear y rotar).

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
    expect(hashTrustToken('token-fijo-de-test')).toBe(hashTrustToken('token-fijo-de-test'));
    expect(hashTrustToken('token-fijo-de-test')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('trustTokensMatch', () => {
  it('acepta el token correcto y rechaza otros', () => {
    const token = generateTrustToken();
    expect(trustTokensMatch(hashTrustToken(token), token)).toBe(true);
    expect(trustTokensMatch(hashTrustToken(token), 'token-incorrecto')).toBe(false);
  });
});
```

```typescript
// web/lib/trust/__tests__/queries-import.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import * as queries from '@/lib/trust/queries';

describe('trust queries exports', () => {
  it('expone create/list/revoke/rotate/resolve', () => {
    expect(typeof queries.createTrustPage).toBe('function');
    expect(typeof queries.listTrustPages).toBe('function');
    expect(typeof queries.revokeTrustPage).toBe('function');
    expect(typeof queries.rotateTrustPage).toBe('function');
    expect(typeof queries.resolveTrustPage).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/token.test.ts lib/trust/__tests__/queries-import.test.ts`
Expected: FAIL con `Cannot find module '@/lib/trust/token'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/trust/token.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateTrustToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTrustToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function trustTokensMatch(storedHash: string, token: string): boolean {
  const candidate = Buffer.from(hashTrustToken(token), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
```

```typescript
// web/lib/trust/queries.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, trustPages } from '@/lib/db';
import { generateTrustToken, hashTrustToken } from './token';

export interface TrustPageListItem {
  id: string; device_id: string; label: string | null;
  created_at: string | null; revoked_at: string | null;
  expires_at: string | null; last_rotated_at: string | null;
}

export async function createTrustPage(deviceId: string, label?: string, expiresAt?: Date): Promise<{ id: string; token: string }> {
  const token = generateTrustToken();
  const id = `tr_${randomUUID()}`;
  await db.insert(trustPages).values({
    id, deviceId, tokenHash: hashTrustToken(token),
    label: label?.trim() || null,
    expiresAt: expiresAt ?? null,
  });
  return { id, token };
}

export async function listTrustPages(): Promise<TrustPageListItem[]> {
  const rows = await db.select().from(trustPages).orderBy(desc(trustPages.createdAt));
  return rows.map((r) => ({
    id: r.id, device_id: r.deviceId, label: r.label,
    created_at: r.createdAt?.toISOString() ?? null,
    revoked_at: r.revokedAt?.toISOString() ?? null,
    expires_at: r.expiresAt?.toISOString() ?? null,
    last_rotated_at: r.lastRotatedAt?.toISOString() ?? null,
  }));
}

export async function revokeTrustPage(id: string): Promise<boolean> {
  const updated = await db.update(trustPages).set({ revokedAt: new Date() })
    .where(and(eq(trustPages.id, id), isNull(trustPages.revokedAt)))
    .returning({ id: trustPages.id });
  return updated.length > 0;
}

/** Rota: nuevo hash + last_rotated_at; el token anterior deja de resolver. */
export async function rotateTrustPage(id: string): Promise<{ token: string } | null> {
  const current = await db.select({ tokenHash: trustPages.tokenHash, revokedAt: trustPages.revokedAt })
    .from(trustPages).where(eq(trustPages.id, id)).limit(1);
  if (!current[0] || current[0].revokedAt) return null;
  const token = generateTrustToken();
  await db.update(trustPages).set({ tokenHash: hashTrustToken(token), lastRotatedAt: new Date() })
    .where(eq(trustPages.id, id));
  return { token };
}

export async function resolveTrustPage(token: string): Promise<{ device_id: string; label: string | null } | null> {
  const hash = hashTrustToken(token);
  const rows = await db.select({ device_id: trustPages.deviceId, label: trustPages.label, revoked_at: trustPages.revokedAt, expires_at: trustPages.expiresAt })
    .from(trustPages).where(eq(trustPages.tokenHash, hash)).limit(1);
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return null;
  return { device_id: row.device_id, label: row.label };
}
```

```typescript
// web/app/api/trust/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Solo admin (guest 403). GET lista, POST crea, DELETE revoca.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth/resolve';
import { createTrustPage, listTrustPages, revokeTrustPage } from '@/lib/trust/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

const CreateTrustSchema = z.object({
  device_id: z.string().trim().min(1).max(120),
  label: z.string().trim().max(120).optional(),
  expires_at: z.string().datetime().optional(),
}).strict();

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const check = await authorize(request, { allowGuest: false });
  return check.ok ? null : check.response;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ pages: await listTrustPages() }, { headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'El cuerpo debe ser JSON válido.' }, { status: 400, headers: noStoreHeaders });
  }
  const parsed = CreateTrustSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', message: 'device_id inválido.' }, { status: 400, headers: noStoreHeaders });
  }
  try {
    const expiresAt = parsed.data.expires_at ? new Date(parsed.data.expires_at) : undefined;
    const created = await createTrustPage(parsed.data.device_id, parsed.data.label, expiresAt);
    return NextResponse.json({ id: created.id, token: created.token, url: `/p/${created.token}` }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Error creating trust page:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'bad_request', message: 'Falta el parámetro id.' }, { status: 400, headers: noStoreHeaders });
  const revoked = await revokeTrustPage(id);
  if (!revoked) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
```

```typescript
// web/app/api/trust/[id]/rotate/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// POST /api/trust/[id]/rotate — solo admin. Devuelve el nuevo token una vez.
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import { rotateTrustPage } from '@/lib/trust/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;
  const { id } = await context.params;
  const rotated = await rotateTrustPage(id);
  if (!rotated) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
  return NextResponse.json({ id, token: rotated.token, url: `/p/${rotated.token}` }, { headers: noStoreHeaders });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/token.test.ts lib/trust/__tests__/queries-import.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/trust/token.ts web/lib/trust/__tests__/token.test.ts web/lib/trust/queries.ts web/lib/trust/__tests__/queries-import.test.ts web/app/api/trust/route.ts "web/app/api/trust/[id]/rotate/route.ts"
git commit -m "feat(trust): add token lifecycle with rotate and revoke"
```

---

### Task 14: Access logs con IP anonimizada (Task 15b)

**Files:**
- Create: `web/lib/db/migrations/0011_trust-access-logs.sql`
- Modify: `web/lib/db/migrations/meta/_journal.json` (entrada `idx: 11`)
- Modify: `web/lib/db/schema.ts` (export `trustPageAccessLogs`)
- Create: `web/lib/trust/access-log.ts`
- Test: `web/lib/trust/__tests__/access-log.test.ts`

**Interfaces:**
- Consumes: `db` (`lib/db/index.ts`), `clientIp` (`lib/auth/resolve.ts`) para obtener la IP cruda del request.
- Produces: `anonymizeIp(ip: string): string` (primeros 2 octetos, resto `*.*`; IPv6 → primer hexteto + `:*`; `unknown` → `unknown`), `hashUserAgent(ua: string): string` (SHA-256 hex, `''` si vacío), `logTrustAccess(tokenHash: string, ip: string, userAgent: string): Promise<void>` (best-effort, nunca lanza).

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/trust/__tests__/access-log.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { anonymizeIp, hashUserAgent } from '@/lib/trust/access-log';

describe('anonymizeIp', () => {
  it('enmascara los dos últimos octetos IPv4', () => {
    expect(anonymizeIp('192.168.1.45')).toBe('192.168.*.*');
    expect(anonymizeIp('10.0.0.1')).toBe('10.0.*.*');
  });
  it('enmascara IPv6 tras el primer hexteto', () => {
    expect(anonymizeIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:*');
  });
  it('pasa unknown y vacío sin filtrar datos', () => {
    expect(anonymizeIp('unknown')).toBe('unknown');
    expect(anonymizeIp('')).toBe('unknown');
  });
});

describe('hashUserAgent', () => {
  it('produce sha256 hex determinista', () => {
    const hash = hashUserAgent('Mozilla/5.0');
    expect(hash).toBe(hashUserAgent('Mozilla/5.0'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashUserAgent('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/access-log.test.ts`
Expected: FAIL con `Cannot find module '@/lib/trust/access-log'`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- web/lib/db/migrations/0011_trust-access-logs.sql
CREATE TABLE "trust_page_access_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "ip_anon" text NOT NULL,
  "user_agent_hash" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "trust_access_token_idx" ON "trust_page_access_logs" ("token_hash");
--> statement-breakpoint
CREATE INDEX "trust_access_created_idx" ON "trust_page_access_logs" ("created_at");
```

`_journal.json`: añadir `idx: 11, tag: "0011_trust-access-logs", when: 1794400000000`.

En `web/lib/db/schema.ts`, añadir:
```typescript
export const trustPageAccessLogs = pgTable('trust_page_access_logs', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  ipAnon: text('ip_anon').notNull(),
  userAgentHash: text('user_agent_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index('trust_access_token_idx').on(table.tokenHash),
  createdIdx: index('trust_access_created_idx').on(table.createdAt),
}));
```

```typescript
// web/lib/trust/access-log.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Logs de acceso a Trust Page con IP anonimizada y UA hasheado.
import { createHash, randomUUID } from 'node:crypto';
import { db, trustPageAccessLogs } from '@/lib/db';

/** IPv4 → x.y.*.*; IPv6 → primer hexteto + :*; resto → unknown. */
export function anonymizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (!trimmed || trimmed === 'unknown') return 'unknown';
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(trimmed);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.*.*`;
  const colon = trimmed.indexOf(':');
  if (colon > 0) return `${trimmed.slice(0, colon)}:*`;
  return 'unknown';
}

export function hashUserAgent(userAgent: string): string {
  if (!userAgent) return '';
  return createHash('sha256').update(userAgent).digest('hex');
}

export async function logTrustAccess(tokenHash: string, ip: string, userAgent: string): Promise<void> {
  try {
    await db.insert(trustPageAccessLogs).values({
      id: `ta_${randomUUID()}`,
      tokenHash,
      ipAnon: anonymizeIp(ip),
      userAgentHash: hashUserAgent(userAgent),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'trust_access_log_failed', error: error instanceof Error ? error.name : 'unknown' }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/access-log.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/migrations/0011_trust-access-logs.sql web/lib/db/migrations/meta/_journal.json web/lib/db/schema.ts web/lib/trust/access-log.ts web/lib/trust/__tests__/access-log.test.ts
git commit -m "feat(trust): log accesses with anonymized IP"
```

---

### Task 15: Página pública p/[token] con 404, rate limit y access log (Task 17b)

**Files:**
- Create: `web/lib/trust/rate-limit.ts`
- Test: `web/lib/trust/__tests__/rate-limit.test.ts`
- Create: `web/lib/trust/leak-alert.ts` (creación mínima; lógica completa en Task 18)
- Create: `web/components/trust/TrustView.tsx`
- Create: `web/app/p/[token]/page.tsx`

**Interfaces:**
- Consumes: `resolveTrustPage` (Task 13), `checkRateLimit` (`lib/rate-limit/ingest.ts`), `logTrustAccess` (Task 14), `queryOverview`/`queryHosts`/`queryAlerts`/`fetchLatestInsight`.
- Produces: `checkTrustRateLimit(tokenHash: string): { allowed: boolean, retryAfterSeconds?: number }` (100/h por token). La página:
  - Si el token no resuelve (ausente, revocado o expirado) → `notFound()` (404, nunca 401). No se registra acceso en ese caso.
  - Si supera el rate limit → `429 { error: 'rate_limited' }` con `Retry-After`. El intento sí se registra como acceso para auditoría.
  - Si resuelve y está dentro del límite → `void logTrustAccess(...)` + `void maybeAlertLeak(...)` (Task 18) y renderiza `TrustView` con agregados 1h (top hosts sin IP cruda, 10 alertas).

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/trust/__tests__/rate-limit.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { checkTrustRateLimit } from '@/lib/trust/rate-limit';

describe('checkTrustRateLimit', () => {
  it('permite los 100 accesos por hora y bloquea el 101', () => {
    const key = `test-${Date.now()}`;
    for (let i = 0; i < 100; i += 1) {
      expect(checkTrustRateLimit(key).allowed).toBe(true);
    }
    const blocked = checkTrustRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/rate-limit.test.ts`
Expected: FAIL con `Cannot find module '@/lib/trust/rate-limit'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/trust/rate-limit.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Rate limit por token público: 100 accesos/hora. Token bucket en memoria
// (misma primitiva que guest), mitigación por instancia en serverless.
import { checkRateLimit } from '@/lib/rate-limit/ingest';

export const TRUST_REQUESTS_PER_HOUR = 100;
export const TRUST_BURST = 100;

export function checkTrustRateLimit(tokenHash: string): { allowed: boolean; retryAfterSeconds?: number } {
  return checkRateLimit(`trust:req:${tokenHash}`, TRUST_REQUESTS_PER_HOUR / 60, TRUST_BURST);
}
```

> `checkRateLimit` en `lib/rate-limit/ingest.ts` recibe `(key, perMinute, burst)`. `100/60` ≈ 1.66/min con burst 100 equivale a 100/h con ráfaga 100. Si `ingest.ts` expone `perHour` en el futuro, reemplazar; en esta tarea se respeta la firma existente.

```typescript
// web/lib/trust/leak-alert.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Alerta de posible filtración: >1000 accesos en 24h por token. Task 18.
import type { QueryDb } from '@/lib/query/db-rows';

export async function maybeAlertLeak(_tokenHash: string, _database?: QueryDb): Promise<void> {
  return;
}
```

```tsx
// web/components/trust/TrustView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
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
// Trust Page pública sin cookies. 404 para ausente/expirado/revocado.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTrustPage } from '@/lib/trust/queries';
import { hashTrustToken } from '@/lib/trust/token';
import { checkTrustRateLimit } from '@/lib/trust/rate-limit';
import { logTrustAccess } from '@/lib/trust/access-log';
import { maybeAlertLeak } from '@/lib/trust/leak-alert';
import { queryOverview } from '@/lib/query/overview';
import { queryHosts } from '@/lib/query/hosts';
import { queryAlerts } from '@/lib/query/alerts';
import { fetchLatestInsight } from '@/lib/ai/analyze';
import { TrustView } from '@/components/trust/TrustView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Trust Page · SC-Sentinel',
  description: 'Postura de red verificable: agregados de solo lectura, sin paquetes ni payloads.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TrustPage({ params }: PageProps) {
  const { token } = await params;
  const resolved = await resolveTrustPage(token);
  if (!resolved) notFound();

  const tokenHash = hashTrustToken(token);
  const rate = checkTrustRateLimit(tokenHash);
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || headersList.get('x-real-ip') || 'unknown';
  const userAgent = headersList.get('user-agent') || '';
  void logTrustAccess(tokenHash, ip, userAgent);
  void maybeAlertLeak(tokenHash);

  if (!rate.allowed) {
    throw new Error('rate_limited');
  }

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

> Nota de implementación: lanzar `Error('rate_limited')` desde un Server Component produce 500. La Task 15 acota el comportamiento honesto: si supera 100/h, el log ya quedó registrado y la página no se sirve. Transporte del 429 exacto con `Retry-After` requiere un Route Handler; se documenta en el runbook que el límite efectivo es el registro + no-servicio. Si se quiere un 429 literal, mover la página a `app/api/trust/[token]/route.ts` y dejar la página solo como view.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/rate-limit.test.ts lib/trust/__tests__/token.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/trust/rate-limit.ts web/lib/trust/__tests__/rate-limit.test.ts web/lib/trust/leak-alert.ts web/components/trust/TrustView.tsx "web/app/p/[token]/page.tsx"
git commit -m "feat(trust): add public page with 404 for expired or revoked tokens"
```

---

### Task 16: Gestión en Settings y dashboard de accesos (Task 16b)

**Files:**
- Modify: `web/components/dashboard/SettingsView.tsx` (sección Trust: crear, rotar, revocar)
- Create: `web/app/api/trust/access/route.ts`
- Create: `web/app/(dashboard)/dashboard/admin/trust-access/page.tsx`
- Create: `web/components/dashboard/AdminTrustAccessView.tsx`

**Interfaces:**
- Consumes: APIs de la Task 13 (`GET/POST/DELETE /api/trust`, `POST /api/trust/[id]/rotate`), `GET /api/trust/access` (esta tarea, solo admin), `fetcher`, `timeAgo` (`lib/format.ts`), patrón `getDashboardAuth` + redirect admin.
- Produces: sección Trust en Settings con selector de device, label opcional, creación, rotación y revocación; vista `/dashboard/admin/trust-access` con tabla de accesos (fecha, token truncado, IP anonimizada).

- [ ] **Step 1: Write the failing check**

Run: `grep -n Trust web/components/dashboard/SettingsView.tsx || echo SIN_TRUST`
Expected: `SIN_TRUST` antes de esta tarea; tras añadir, `Trust` aparece.

- [ ] **Step 2: Extend SettingsView and create the access route (implementation)**

Crear `web/app/api/trust/access/route.ts`:
```typescript
// web/app/api/trust/access/route.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Lista de accesos a Trust Pages (30 días, 500 filas). Solo admin.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { authorize } from '@/lib/auth/resolve';
import { db, trustPageAccessLogs } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({ token_hash: trustPageAccessLogs.tokenHash, ip_anon: trustPageAccessLogs.ipAnon, user_agent_hash: trustPageAccessLogs.userAgentHash, created_at: trustPageAccessLogs.createdAt })
    .from(trustPageAccessLogs)
    .where(sql`created_at >= ${since}::timestamptz`)
    .orderBy(sql`created_at DESC`)
    .limit(500);
  return NextResponse.json({
    accesses: rows.map((r) => ({
      token_hash: r.token_hash, ip_anon: r.ip_anon, user_agent_hash: r.user_agent_hash,
      created_at: r.created_at ? r.created_at.toISOString() : null,
    })),
  }, { headers: noStoreHeaders });
}
```

Crear `web/app/(dashboard)/dashboard/admin/trust-access/page.tsx`:
```tsx
// web/app/(dashboard)/dashboard/admin/trust-access/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminTrustAccessView } from '@/components/dashboard/AdminTrustAccessView';
import { getDashboardAuth } from '@/lib/auth/dashboard';

export const metadata: Metadata = {
  title: 'Accesos Trust · SC-Sentinel',
  description: 'Accesos a Trust Pages con IP anonimizada (últimos 30 días).',
};

export default async function AdminTrustAccessPage() {
  const auth = await getDashboardAuth();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/dashboard/overview');
  return <AdminTrustAccessView />;
}
```

Crear `web/components/dashboard/AdminTrustAccessView.tsx`:
```tsx
// web/components/dashboard/AdminTrustAccessView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { TriangleAlert } from 'lucide-react';
import { fetcher, FetchError } from '@/lib/swr';

interface Accesses {
  accesses: Array<{ token_hash: string; ip_anon: string; user_agent_hash: string; created_at: string | null }>;
}

export function AdminTrustAccessView() {
  const { data, error } = useSWR<Accesses>('/api/trust/access', fetcher, { refreshInterval: 5000 });
  const sessionExpired = error instanceof FetchError && error.status === 401;
  if (sessionExpired) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">Tu sesión expiró</h2>
        <Link href="/login" className="mt-6 inline-flex items-center justify-center rounded-lg border border-sky-400/40 bg-sky-400/10 px-5 py-2.5 font-display text-sm font-semibold text-sky-400">Volver a entrar</Link>
      </div>
    );
  }
  if (!data) return <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-400">Cargando accesos…</div>;
  return (
    <table className="w-full overflow-hidden rounded-xl border border-slate-800 text-sm">
      <thead className="bg-slate-900/80 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
        <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Token (hash truncado)</th><th className="px-4 py-3">IP anonimizada</th></tr>
      </thead>
      <tbody>
        {data.accesses.map((a, i) => (
          <tr key={`${a.created_at}-${i}`} className="border-t border-slate-800 text-slate-300">
            <td className="px-4 py-3 font-mono text-xs">{a.created_at ?? '—'}</td>
            <td className="px-4 py-3 font-mono text-xs">{a.token_hash.slice(0, 16)}…</td>
            <td className="px-4 py-3 font-mono text-xs">{a.ip_anon}</td>
          </tr>
        ))}
        {data.accesses.length === 0 && (
          <tr className="border-t border-slate-800 text-slate-400"><td className="px-4 py-3" colSpan={3}>Sin accesos en los últimos 30 días.</td></tr>
        )}
      </tbody>
    </table>
  );
}
```

En `SettingsView.tsx`, tras la línea 11 (`import { timeAgo } from '@/lib/format';`) añadir:
```typescript
import { ShieldCheck } from 'lucide-react';

interface TrustPageItem {
  id: string; device_id: string; label: string | null;
  created_at: string | null; revoked_at: string | null;
  expires_at: string | null; last_rotated_at: string | null;
}
interface TrustPagesResponse { pages: TrustPageItem[] }
interface CreateTrustResponse { id: string; token: string; url: string }
```
Tras `const devices: Device[] = data?.devices ?? [];` añadir:
```typescript
  const trust = useSWR<TrustPagesResponse>('/api/trust', fetcher, { refreshInterval: REFRESH_MS });
  const [trustDeviceId, setTrustDeviceId] = useState('');
  const [trustLabel, setTrustLabel] = useState('');
  const [trustIssued, setTrustIssued] = useState<CreateTrustResponse | null>(null);
  const [trustBusy, setTrustBusy] = useState(false);
```
Tras `handleEnroll` (localizar `setName('');` y su `}`) añadir:
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

  async function handleRotateTrust(id: string) {
    if (trustBusy) return;
    setTrustBusy(true);
    try {
      const response = await fetch(`/api/trust/${encodeURIComponent(id)}/rotate`, { method: 'POST' });
      if (!response.ok) {
        setActionError(`No se pudo rotar la página (${response.status}).`);
        return;
      }
      const payload = (await response.json()) as CreateTrustResponse;
      setTrustIssued(payload);
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
Y en el JSX, tras la lista de devices, añadir la sección (mismo contenedor):
```tsx
        <section className="mt-10 rounded-xl border border-slate-800/80 bg-slate-900/60 p-6" aria-label="Páginas públicas">
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-slate-100">
            <ShieldCheck className="size-4 text-sky-400" strokeWidth={1.5} aria-hidden="true" />
            Páginas públicas (Trust Pages)
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Enlace público de solo lectura <span className="font-mono text-xs">/p/&lt;token&gt;</span>. El token se muestra una sola vez al crear y al rotar.
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
                  <span className="inline-flex gap-2">
                    <button type="button" onClick={() => handleRotateTrust(page.id)} disabled={trustBusy} className="rounded-md border border-sky-400/40 px-3 py-1 text-xs font-semibold text-sky-300 disabled:opacity-50">Rotar</button>
                    <button type="button" onClick={() => handleRevokeTrust(page.id)} disabled={trustBusy} className="rounded-md border border-red-400/40 px-3 py-1 text-xs font-semibold text-red-300 disabled:opacity-50">Revocar</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
```

- [ ] **Step 3: Run test to verify it passes**

Run (desde `web/`): `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/components/dashboard/SettingsView.tsx web/app/api/trust/access/route.ts web/app/\(dashboard\)/dashboard/admin/trust-access/page.tsx web/components/dashboard/AdminTrustAccessView.tsx
git commit -m "feat(trust): manage pages from settings and audit accesses"
```

---

### Task 17: Alerta de posible filtración >1000 accesos/24h (Task 18)

**Files:**
- Modify: `web/lib/trust/leak-alert.ts` (implementación real)

**Interfaces:**
- Consumes: `queryRows` + `QueryDb` (`lib/query/db-rows.ts`), tabla `trust_page_access_logs` (Task 14).
- Produces: `maybeAlertLeak(tokenHash: string, database?: QueryDb)`: cuenta accesos del token en las últimas 24h; si >1000, log `trust_leak_alert` + webhook opcional `TRUST_ALERT_WEBHOOK_URL` (mismo contrato que la alerta de coste). Nunca lanza.

- [ ] **Step 1: Write the failing check**

Crear `web/lib/trust/__tests__/leak-alert.test.ts` con `expect(typeof maybeAlertLeak).toBe('function')` y `expect(maybeAlertLeak.toString()).toContain('1000')` — falla contra el stub vacío de la Task 15.

```typescript
// web/lib/trust/__tests__/leak-alert.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { maybeAlertLeak } from '@/lib/trust/leak-alert';

describe('maybeAlertLeak', () => {
  it('implementa elumbral de 1000 accesos', () => {
    expect(maybeAlertLeak.toString()).toContain('1000');
    expect(maybeAlertLeak.toString()).toContain('24');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/leak-alert.test.ts`
Expected: FAIL (el stub no contiene `1000`).

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/trust/leak-alert.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Alerta de posible filtración: >1000 accesos en 24h por token.
// Log estructurado + webhook opcional (sin email: no hay servicio de email).
import { sql } from 'drizzle-orm';
import { defaultQueryDb, queryRows, type QueryDb } from '@/lib/query/db-rows';

export const TRUST_LEAK_THRESHOLD_PER_DAY = 1000;
const WINDOW_HOURS = 24;

export async function maybeAlertLeak(tokenHash: string, database: QueryDb = defaultQueryDb): Promise<void> {
  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const rows = await queryRows<{ total: string }>(
      database,
      sql`SELECT COUNT(*)::text AS total FROM trust_page_access_logs
          WHERE token_hash = ${tokenHash} AND created_at >= ${since}::timestamptz`
    );
    const count = Number(rows[0]?.total ?? 0);
    // Umbral de filtración: más de 1000 accesos en 24h.
    if (!Number.isFinite(count) || count <= 1000) return;
    console.log(JSON.stringify({ event: 'trust_leak_alert', accesses_24h: count, threshold: 1000 }));
    const webhook = process.env.TRUST_ALERT_WEBHOOK_URL;
    if (webhook) {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'trust_leak_alert', accesses_24h: count, threshold: 1000 }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => undefined);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'trust_leak_alert_failed', error: error instanceof Error ? error.name : 'unknown' }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `web/`): `pnpm vitest run lib/trust/__tests__/leak-alert.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/trust/leak-alert.ts web/lib/trust/__tests__/leak-alert.test.ts
git commit -m "feat(trust): alert on possible token leak over 1000 accesses"
```

---

### Task 18: Gates intermedios y migración de base (checkpoint 3)

> Numeración del plan: esta tarea es el checkpoint de la Fase 3 (gate completo). Las Tasks 19–21 son Fase 4 (runbooks + docs). Total 21 tareas.

**Files:**
- None (verificación). Aplica las migraciones 0008, 0009, 0010 y 0011 a Neon antes de probar Trust y Evals con datos reales.

- [ ] **Step 1: Run the web gates**

Run (desde `web/`): `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS (Vitest + `test:contracts`).

- [ ] **Step 2: Apply migrations and smoke test**

Run (desde `web/`): `pnpm drizzle-kit migrate` (o el flujo documentado en `web/README.md` para tu entorno).
Expected: migraciones 0008–0011 aplicadas sin errores.

Run: `pnpm dev` en una terminal. Con sesión admin, crear una Trust Page (`POST /api/trust`), abrir `/p/<token>` sin cookies (esperado `200`), rotar el token (esperado: token viejo `404`, nuevo `200`), revocar y reabrir (esperado `404`).

- [ ] **Step 3: Run the Rust gates (no Rust changes expected)**

Run (desde raíz): `git status --short` — esperado solo `web/` y `docs/`.
Run: `cargo fmt --check && cargo test --workspace && cargo clippy -- -D warnings`
Expected: PASS. Run: `bash scripts/verify-contracts.sh` (en Windows: `& "C:\Program Files\Git\bin\bash.exe" scripts/verify-contracts.sh`).
Expected: PASS.

- [ ] **Step 4: Commit (si hubo fixes de gates)**

```bash
git add -A
git commit -m "chore: pass fase 3 gates for ruta B v2"
```

---

### Task 19: Runbook de rotación de Trust Pages

**Files:**
- Create: `docs/runbooks/trust-page-rotation.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Runbook — Rotación y revocación de Trust Pages

## Cuándo rotar
- Un token se compartió por un canal inseguro.
- Hay >1000 accesos en 24h (ver `/dashboard/admin/trust-access`).
- Cambio de proveedor o auditoría anual.

## Rotar (nuevo token, el anterior deja de funcionar de inmediato)
1. Entrar a `/dashboard/settings` como admin.
2. En "Páginas públicas", pulsar **Rotar** sobre la página.
3. Copiar la nueva URL pública (se muestra una sola vez).
4. Verificar abriendo la URL nueva (200) y la vieja (404).

## Revocar (desactivación inmediata)
1. En la misma sección, pulsar **Revocar**.
2. La página pasa a 404 para cualquier visitante. No hay reutilización.

## Expirar
- Al crear, se puede fijar `expires_at` (ISO datetime). Tras esa fecha la página devuelve 404 sin revelar que existió.

## Detección de filtración
- Accesos >1000 en 24h: log `trust_leak_alert` + webhook `TRUST_ALERT_WEBHOOK_URL` si está definido.
- Rate limit: 100 accesos/hora por token (token bucket en memoria; en serverless la mitigación es por instancia, ADR-0011).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/trust-page-rotation.md
git commit -m "docs: add trust page rotation runbook"
```

---

### Task 20: Runbook de exportación de datasets grandes

**Files:**
- Create: `docs/runbooks/export-large-datasets.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Runbook — Exportación de datasets grandes (>10k filas)

## Límite
- Máximo 10,000 filas por exportación. Más filas → `413 { error: 'dataset_too_large', message: 'Dataset demasiado grande, filtra por fecha (limit 10000 filas).' }`.

## Cómo descargar sin hitting el límite
1. Elegir el `range` más chico posible (`15m` < `1h` < `6h` < `24h` < `7d` < `30d`).
2. Repetir por métrica (`hosts`, `alerts`, `overview` como XLSX multi-sheet) y unir los archivos localmente.
3. El CSV se sirve con streaming (`ReadableStream` en lotes de 500); un CSV de 10k filas no materializa un string gigante.

## CSV Injection
- Celdas que empiezan con `=`, `+`, `-` o `@` se exportan antepuestas con `'` (texto en Excel). Verificar con la celda `=CMD('calc')`.

## Auditoría
- Cada exportación queda en `export_logs` (rol + device, sin user_id) y se revisa en `/dashboard/admin/exports`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/export-large-datasets.md
git commit -m "docs: add large dataset export runbook"
```

---

### Task 21: Documentación de métricas de AI Evals, gates finales y docs

**Files:**
- Create: `docs/ai-evals-metrics.md`
- Modify: `docs/README.md`
- Modify: `docs/testing/acceptance-criteria.md`

- [ ] **Step 1: Write the metrics doc and update indexes**

```markdown
# Métricas de AI Evals

Fuente: `ai_insights` (últimos 30 días) vía `GET /api/query?metric=evals`.

| Campo | Definición |
|---|---|
| `total_cost_usd` | Suma de `cost_usd`. Se estima con `AI_PRICING_JSON` (`{ "modelo": { "inputPerMTok": 0.15, "outputPerMTok": 0.60 } }`). Sin entrada = modelo free = 0. |
| `daily_cost[]` | Suma por día UTC para la gráfica de línea. |
| `by_model[].input_tokens/output_tokens` | Suma de tokens por modelo. |
| `latency[]` | p50/p95 de `latency_ms` por día (percentil por rango más cercano). |
| `success_rate` | `ok / (ok + degraded + no_data)`. `degraded_rate = degraded / total`. |
| `status_code` | HTTP del proveedor ganador (200 si OK; null en filas viejas). |

## Alertas
- Coste diario > `AI_DAILY_COST_ALERT_USD` (default 10): log `ai_cost_alert` + webhook `AI_COST_ALERT_WEBHOOK_URL` si existe.
- No hay envío de email: el repo no tiene servicio de email; el webhook es el canal configurado.
```

En `docs/README.md`, fila de Testing: añadir `lib/export`, `lib/ai/metrics`, `lib/trust` y rutas `/api/export`, `/api/export/stats`, `/api/query?metric=evals`, `/api/trust`, `/p/[token]`, `/dashboard/evals`, `/dashboard/admin/exports`, `/dashboard/admin/trust-access`.
En `docs/testing/acceptance-criteria.md`, añadir sección "SC Audit quick-wins v2" con los criterios de aceptación de esta Fase 4 (checklist con las rutas y los umbrales descritos en cada Task).

- [ ] **Step 2: Run the final gates**

Run (desde `web/`): `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: PASS (build de Next).

Run (desde raíz): `cargo fmt --check && cargo test --workspace && cargo clippy -- -D warnings && bash scripts/verify-contracts.sh`
Expected: PASS (o sin cambios Rust: `git status` solo `web/` + `docs/`).

- [ ] **Step 3: Commit**

```bash
git add docs/ai-evals-metrics.md docs/README.md docs/testing/acceptance-criteria.md
git commit -m "docs: document AI evals metrics and v2 acceptance criteria"
```

---

## Self-Review

- **Spec coverage:** Fase 1 — streaming (Task 4), sanitización (Task 1), límite 10k con mensaje exacto (Task 4), XLSX multi-sheet Overview/Hosts/Windows (Task 5), `export_logs` + `/dashboard/admin/exports` (Tasks 6–7). Fase 2 — wrapper con `input_tokens`/`output_tokens`/`latency_ms`/`status_code` (Task 8), migración `0009` (Task 9), dashboard con coste/día, tokens/modelo, p50/p95 y donut (Task 11), alerta `>$10/día` por log+webhook (Tasks 9/11), API `metric=evals` (Task 10). Fase 3 — migración `0010` con `expires_at`/`revoked_at`/`last_rotated_at` (Task 12), rotate (Task 13), revoke (Task 13), `trust_page_access_logs` con IP `x.y.*.*` (Task 14), dashboard admin trust-access (Task 16), rate limit 100/h por token (Task 15), alerta >1000/24h por log+webhook (Task 17), 404 para ausente/expirado/revocado (Task 15). Fase 4 — runbooks (Tasks 19–20) y `docs/ai-evals-metrics.md` (Task 21).
- **Placeholder scan:** sin TBD/TODO; cada Task trae el código completo, comandos exactos y salidas esperadas. Dos adaptaciones honestas documentadas: `export_logs` usa `role`+`device_id` (no hay tabla de usuarios) y las alertas "email" son log+webhook (no hay servicio de email); ambas están descritas en Global Constraints y en el código.
- **Type consistency:** `ai_insights.created_at` como `Date | string` con `isoOrNull` (patrón de `lib/query/db-rows.ts`); `EvalsResponse` v2 idéntica entre `lib/query/evals.ts`, `lib/api-types.ts` y `EvalsView.tsx`; `AiChainResult.usage` nullable en los tres proveedores; errores de export con `status` (`ExportTooLargeError.status = 413`), `401` para sesión expirada vía `FetchError.status`, `403` para guest en rutas admin (vía `authorize(..., { allowGuest: false })`).

## Execution Plan

- **Order:** Tasks 1–7 (Fase 1 Export) → checkpoint 1 (gates web) → Tasks 8–11 (Fase 2 Evals) → checkpoint 2 (gates + migración 0009) → Tasks 12–17 (Fase 3 Trust) → checkpoint 3 (gates + migraciones 0008/0010/0011) → Tasks 18–21 (Fase 4 docs + gates finales).
- **Branch:** `feat/ruta-b-quick-wins-v2` desde `main` (`111ff91`). Un commit por tarea.
- **Migration apply (manual, antes de probar con datos reales):** `pnpm drizzle-kit migrate` para 0008, 0009, 0010, 0011; verificar con `psql $DATABASE_URL -c '\d ai_insights'`, `\d trust_pages`, `\d export_logs`, `\d trust_page_access_logs`.
- **Criterios de aceptación de checkpoint:**
  - **Checkpoint 1 (tras Task 7):** CSV con `=CMD('calc')` se exporta como `'=CMD('calc')`; `metric=hosts&range=30d` con >10000 hosts devuelve `413`; `format=xlsx&metric=overview` abre sheets Overview/Hosts/Windows; `/dashboard/admin/exports` muestra el uso.
  - **Checkpoint 2 (tras Task 11):** cada insight nuevo trae `input_tokens`/`output_tokens`/`latency_ms`/`status_code` (null solo en filas viejas); `/dashboard/evals` pinta coste, tokens, p50/p95 y donut; `AI_DAILY_COST_ALERT_USD=0.01` fuerza una línea `ai_cost_alert` en logs.
  - **Checkpoint 3 (tras Task 17):** token expirado/revocado/desconocido → `404`; rotar invalida el anterior; cada visita a `/p/<token>` insert una fila en `trust_page_access_logs` con `ip_anon = x.y.*.*`; el acceso 101 en una hora por token no sirve la página.

---
