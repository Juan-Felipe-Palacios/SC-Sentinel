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
