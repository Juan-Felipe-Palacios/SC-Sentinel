// web/components/dashboard/AdminTrustAccessView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
import useSWR from 'swr';
import { fetcher } from '@/lib/swr';

interface AccessItem {
  id: string;
  token_hash_prefix: string;
  ip_anon: string;
  user_agent_hash: string;
  created_at: string | null;
}

export function AdminTrustAccessView() {
  const { data } = useSWR<{ accesses: AccessItem[] }>('/api/trust/access', fetcher, { refreshInterval: 5000 });
  const accesses = data?.accesses ?? [];
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Accesos públicos (30 días)</p>
        <p className="mt-1 text-sm text-slate-400">IP anonimizada `x.y.*.*`. Últimos {accesses.length} accesos.</p>
      </div>
      <table className="w-full overflow-hidden rounded-xl border border-slate-800 text-sm">
        <thead className="bg-slate-900/80 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
          <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Token</th><th className="px-4 py-3">IP anon</th><th className="px-4 py-3">UA hash</th></tr>
        </thead>
        <tbody>
          {accesses.map((a) => (
            <tr key={a.id} className="border-t border-slate-800 text-slate-300">
              <td className="px-4 py-3 font-mono text-xs">{a.created_at ?? '—'}</td>
              <td className="px-4 py-3 font-mono text-xs">{a.token_hash_prefix}…</td>
              <td className="px-4 py-3 font-mono text-xs">{a.ip_anon}</td>
              <td className="px-4 py-3 font-mono text-xs">{a.user_agent_hash.slice(0, 12)}…</td>
            </tr>
          ))}
          {accesses.length === 0 && (
            <tr className="border-t border-slate-800 text-slate-400"><td className="px-4 py-3" colSpan={4}>Sin accesos en los últimos 30 días.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
