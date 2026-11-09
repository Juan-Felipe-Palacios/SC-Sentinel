// web/components/dashboard/EvalsView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import useSWR from 'swr';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetcher } from '@/lib/swr';
import type { EvalsResponse } from '@/lib/api-types';
import type { QueryRange } from '@/lib/schemas/query';

const PIE_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#94a3b8'];

export function EvalsView({ range }: { range: QueryRange }) {
  const { data } = useSWR<EvalsResponse>(`/api/query?metric=evals&range=${range}`, fetcher, { refreshInterval: 15000 });
  if (!data) return <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-400">Cargando evals…</div>;

  const costData = data.daily_cost.map((d) => ({ day: d.day.slice(5), cost_usd: d.cost_usd }));
  const modelData = data.by_model.map((m) => ({ model: m.model.length > 18 ? `${m.model.slice(0, 17)}…` : m.model, total: m.total, full: m.model }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Tasa de éxito</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{data.success_rate === null ? '—' : `${(data.success_rate * 100).toFixed(1)}%`}</p>
          <p className="mt-1 text-xs text-slate-500">{data.succeeded}/{data.total}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Latencia p50</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{data.latency_p50_ms === null ? '—' : `${Math.round(data.latency_p50_ms)} ms`}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Latencia p95</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{data.latency_p95_ms === null ? '—' : `${Math.round(data.latency_p95_ms)} ms`}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Coste total</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">${data.by_model.reduce((acc, m) => acc + m.cost_usd, 0).toFixed(6)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Coste diario (USD)</p>
        <div className="mt-4 h-56">
          <ResponsiveContainer>
            <LineChart data={costData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={50} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
              <Line type="monotone" dataKey="cost_usd" stroke="#38bdf8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Llamadas por modelo</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <BarChart data={modelData}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="model" tick={{ fill: '#94a3b8', fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                <Bar dataKey="total" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Reparto por modelo</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={modelData} dataKey="total" nameKey="full" innerRadius={50} outerRadius={80}>
                  {modelData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
