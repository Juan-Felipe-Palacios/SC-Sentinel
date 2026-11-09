// web/app/(dashboard)/dashboard/evals/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { EvalsView } from '@/components/dashboard/EvalsView';
import { getDashboardAuth } from '@/lib/auth/dashboard';
import { queryRangeSchema, type QueryRange } from '@/lib/schemas/query';

export const metadata: Metadata = {
  title: 'Evals de IA · SC-Sentinel',
  description: 'Coste, latencia y tasa de éxito de los análisis con IA por modelo.',
};

export default async function EvalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getDashboardAuth();
  if (!session) redirect('/login');
  const raw = await searchParams;
  const rawRange = typeof raw.range === 'string' ? raw.range : undefined;
  const parsed = queryRangeSchema.safeParse(rawRange);
  const range: QueryRange = parsed.success ? parsed.data : '24h';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">Observabilidad IA</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-slate-100">Evals de IA</h2>
          <p className="mt-1 text-sm text-slate-400">Coste, latencia y tasa de éxito por modelo y día (últimas {range}). Los modelos free cuestan 0 USD.</p>
        </div>
      </div>
      <EvalsView range={range} />
    </div>
  );
}
