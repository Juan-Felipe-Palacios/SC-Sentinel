// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Check,
  CheckCircle2,
  History,
  Loader2,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import type {
  AlertDetailResponse,
  AlertItem,
  AlertMutationResponse,
  AlertsResponse,
  OperatorsResponse,
} from '@/lib/api-types';
import type { QueryRange } from '@/lib/schemas/query';
import { fetcher, FetchError } from '@/lib/swr';
import { timeAgo, severityRank } from '@/lib/format';
import { useDashboardRole } from './DashboardRoleContext';
import { ExportBar } from './ExportBar';

const REFRESH_MS = 5000;
const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low'] as const;
const STATUSES = ['all', 'open', 'acknowledged', 'resolved', 'expired'] as const;
type SeverityFilter = (typeof SEVERITIES)[number];
type StatusFilter = (typeof STATUSES)[number];

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-red-400 border-red-400/40 bg-red-400/10',
  high: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
  medium: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  low: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const STATUS_STYLES: Record<string, string> = {
  open: 'text-sky-400 border-sky-400/40 bg-sky-400/10',
  acknowledged: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  resolved: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  expired: 'text-slate-400 border-slate-600/60 bg-slate-800/60',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierta',
  acknowledged: 'Reconocida',
  resolved: 'Resuelta',
  expired: 'Vencida',
};

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Todos los estados',
  open: 'Abiertas',
  acknowledged: 'Reconocidas',
  resolved: 'Resueltas',
  expired: 'Vencidas',
};

const AUDIT_LABELS: Record<string, string> = {
  acknowledge: 'Reconocida',
  resolve: 'Resuelta',
  assign: 'Asignación',
  note_added: 'Nota agregada',
  reopen: 'Reabierta',
  expire: 'Vencida automáticamente',
};

function errorMessage(status: number): string {
  if (status === 401) return 'La sesión expiró. Volvé a entrar para operar las alertas.';
  if (status === 403) return 'El modo visitante es solo lectura.';
  if (status === 409) return 'La alerta está resuelta o vencida; reabrila para operarla.';
  if (status === 404) return 'La alerta ya no existe o fue eliminada por retención.';
  return `No se pudo actualizar la alerta (${status}).`;
}

export function AlertsView({ range }: { range: QueryRange }) {
  const { role } = useDashboardRole();
  const isAdmin = role === 'admin';

  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  const key = `/api/query?metric=alerts&range=${range}`;
  const { data, error, mutate } = useSWR<AlertsResponse>(key, fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const { data: operatorsData } = useSWR<OperatorsResponse>(
    isAdmin ? '/api/operators' : null,
    fetcher
  );
  const operators = operatorsData?.operators ?? [];
  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<AlertDetailResponse>(
    isAdmin && detailId ? `/api/alerts/${encodeURIComponent(detailId)}` : null,
    fetcher
  );

  function openDetail(alert: AlertItem) {
    setDetailId(alert.id);
    setAssigneeDraft(alert.assignee_operator_id ?? '');
    setNoteDraft('');
    setActionError(null);
  }

  async function runAction(
    alert: AlertItem,
    payload:
      | { action: 'acknowledge' }
      | { action: 'resolve' }
      | { action: 'reopen' }
      | { action: 'assign'; assignee_operator_id: string | null }
      | { action: 'note'; body: string }
  ): Promise<AlertMutationResponse | null> {
    if (!isAdmin || busy) return null;
    setBusy(`${alert.id}:${payload.action}`);
    setActionError(null);

    try {
      const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setActionError(errorMessage(response.status));
        return null;
      }
      const result = (await response.json()) as AlertMutationResponse;
      await mutate();
      if (detailId === alert.id) await mutateDetail();
      return result;
    } catch {
      setActionError('Error de conexión al actualizar la alerta.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleAcknowledge(alert: AlertItem) {
    await runAction(alert, { action: 'acknowledge' });
  }

  async function handleResolve(alert: AlertItem) {
    await runAction(alert, { action: 'resolve' });
  }

  async function handleReopen(alert: AlertItem) {
    await runAction(alert, { action: 'reopen' });
  }

  async function handleAssign(alert: AlertItem) {
    const result = await runAction(alert, {
      action: 'assign',
      assignee_operator_id: assigneeDraft || null,
    });
    if (result) setAssigneeDraft(result.alert.assignee_operator_id ?? '');
  }

  async function handleNote(alert: AlertItem) {
    const body = noteDraft.trim();
    if (!body) return;
    const result = await runAction(alert, { action: 'note', body });
    if (result) setNoteDraft('');
  }

  if (error instanceof FetchError && error.status === 401) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <p className="font-display text-lg font-semibold text-slate-100">Tu sesión expiró</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">Volvé a entrar para seguir viendo el panel.</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <p className="font-display text-lg font-semibold text-slate-100">No se pudieron cargar las alertas</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {error instanceof FetchError ? `El servidor respondió ${error.status}.` : 'Error de conexión.'} Revisá que la base esté disponible y reintentá.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando alertas">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        ))}
      </div>
    );
  }

  const alerts: AlertItem[] = (data.alerts ?? []).slice().sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || (b.created_at ?? '').localeCompare(a.created_at ?? '')
  );
  const filtered = alerts.filter((alert) => {
    const severityOk = filter === 'all' || (alert.severity ?? '').toLowerCase() === filter;
    const statusOk = statusFilter === 'all' || alert.status === statusFilter;
    return severityOk && statusOk;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">Motor de alertas</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-slate-100">Alertas y anomalías</h2>
          <p className="mt-1 text-sm text-slate-400">
            {data.total} alertas en el rango seleccionado. Cada incidente incluye su evidencia y su ciclo de vida.
          </p>
        </div>
        <ExportBar range={range} zoom={null} />
      </div>

      {actionError ? (
        <p role="alert" className="rounded-lg border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-xs leading-5 text-orange-400">
          {actionError}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar por severidad">
          {SEVERITIES.map((sev) => {
            const active = filter === sev;
            const label = sev === 'all' ? 'Todas' : SEVERITY_LABELS[sev] ?? sev;
            return (
              <button
                key={sev}
                type="button"
                onClick={() => setFilter(sev)}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
                  active
                    ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar por estado">
          {STATUSES.map((status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
                  active
                    ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {STATUS_FILTER_LABELS[status]}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border-slate-800/80 bg-slate-900/60 px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-slate-100">Sin alertas para estos filtros</p>
          <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-5 text-slate-400">
            Probá con otro estado o severidad. Si no hay coincidencias, la señal agregada no disparó reglas en esta ventana.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((alert) => {
            const severity = (alert.severity ?? '').toLowerCase();
            const chip = SEVERITY_STYLES[severity] ?? 'text-slate-400 border-white/10 bg-slate-800/60';
            const label = SEVERITY_LABELS[severity] ?? alert.severity;
            const statusChip = STATUS_STYLES[alert.status] ?? STATUS_STYLES.open;
            const statusLabel = STATUS_LABELS[alert.status] ?? alert.status;
            const detailOpen = detailId === alert.id;
            const actionBusy = busy?.startsWith(`${alert.id}:`) ?? false;

            return (
              <li key={alert.id} className="rounded-xl border-slate-800/80 bg-slate-900/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${chip}`}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {label}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${statusChip}`}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {statusLabel}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                        {alert.rule_id}
                      </span>
                      <time className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                        {alert.created_at ? timeAgo(alert.created_at) : ''}
                      </time>
                    </div>
                    <p className="mt-2 font-display text-[15px] font-semibold text-slate-100">{alert.title}</p>
                    {alert.description ? (
                      <p className="mt-1 text-[12px] leading-5 text-slate-400">{alert.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3" aria-hidden="true" />
                        {alert.assignee ?? 'Sin asignar'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3" aria-hidden="true" />
                        {alert.notes_count} {alert.notes_count === 1 ? 'nota' : 'notas'}
                      </span>
                      {alert.acknowledged_at ? <span>Reconocida {timeAgo(alert.acknowledged_at)}</span> : null}
                      {alert.resolved_at ? <span>Resuelta {timeAgo(alert.resolved_at)}</span> : null}
                      {alert.sla_breached ? (
                        <span className="text-red-400">SLA vencido</span>
                      ) : alert.sla_due_at ? (
                        <span>SLA {new Date(alert.sla_due_at).toLocaleString('es-AR')}</span>
                      ) : null}
                      {alert.expires_at ? (
                        <span>Vence {new Date(alert.expires_at).toLocaleDateString('es-AR')}</span>
                      ) : null}
                    </div>
                  </div>
                  <ShieldAlert className="size-5 shrink-0 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
                </div>

                {alert.evidence ? (
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[10px] leading-5 text-sky-300">
                    {JSON.stringify(alert.evidence, null, 2)}
                  </pre>
                ) : null}

                {isAdmin ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {alert.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() => void handleAcknowledge(alert)}
                        disabled={actionBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-3 py-1.5 font-display text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-400/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                      >
                        {busy === `${alert.id}:acknowledge` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
                        Reconocer
                      </button>
                    ) : null}
                    {alert.status !== 'resolved' && alert.status !== 'expired' ? (
                      <button
                        type="button"
                        onClick={() => void handleResolve(alert)}
                        disabled={actionBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 px-3 py-1.5 font-display text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                      >
                        {busy === `${alert.id}:resolve` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                        Resolver
                      </button>
                    ) : null}
                    {alert.status === 'resolved' || alert.status === 'expired' ? (
                      <button
                        type="button"
                        onClick={() => void handleReopen(alert)}
                        disabled={actionBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 px-3 py-1.5 font-display text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-400/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                      >
                        {busy === `${alert.id}:reopen` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                        Reabrir
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openDetail(alert)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 font-display text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                    >
                      <User className="size-3.5" aria-hidden="true" />
                      Asignar
                    </button>
                    <button
                      type="button"
                      onClick={() => openDetail(alert)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 font-display text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                    >
                      <MessageSquare className="size-3.5" aria-hidden="true" />
                      Nota
                    </button>
                    <button
                      type="button"
                      onClick={() => (detailOpen ? setDetailId(null) : openDetail(alert))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 font-display text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                    >
                      <History className="size-3.5" aria-hidden="true" />
                      {detailOpen ? 'Cerrar' : 'Historial'}
                    </button>
                  </div>
                ) : null}

                {isAdmin && detailOpen ? (
                  <div className="mt-4 space-y-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-400">Gestión de la alerta</p>
                      <button
                        type="button"
                        onClick={() => setDetailId(null)}
                        aria-label="Cerrar gestión de la alerta"
                        className="rounded p-1 text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </div>

                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleAssign(alert);
                      }}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="flex min-w-52 flex-1 flex-col gap-1">
                        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-400">Responsable</span>
                        <select
                          value={assigneeDraft}
                          onChange={(event) => setAssigneeDraft(event.target.value)}
                          className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                        >
                          <option value="">Sin asignar</option>
                          {operators.map((operator) => (
                            <option key={operator.id} value={operator.id}>
                              {operator.name} · {operator.email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        disabled={actionBusy}
                        className="rounded-lg border border-sky-400/40 px-3 py-2 font-display text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-400/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                      >
                        {busy === `${alert.id}:assign` ? 'Guardando…' : 'Guardar responsable'}
                      </button>
                      {alert.assignee ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAssigneeDraft('');
                            void runAction(alert, { action: 'assign', assignee_operator_id: null });
                          }}
                          disabled={actionBusy}
                          className="rounded-lg border border-slate-800 px-3 py-2 font-display text-xs font-semibold text-slate-400 transition-colors hover:text-slate-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </form>

                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleNote(alert);
                      }}
                      className="space-y-2"
                    >
                      <label className="flex flex-col gap-1">
                        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-400">Nueva nota</span>
                        <textarea
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          maxLength={4000}
                          rows={3}
                          placeholder="Qué revisaste, qué decidiste o qué falta hacer."
                          className="resize-y rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                        />
                      </label>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[8px] text-slate-500">{noteDraft.length}/4000</span>
                        <button
                          type="submit"
                          disabled={actionBusy || !noteDraft.trim()}
                          className="rounded-lg border border-sky-400/40 px-3 py-1.5 font-display text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-400/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                        >
                          {busy === `${alert.id}:note` ? 'Agregando…' : 'Agregar nota'}
                        </button>
                      </div>
                    </form>

                    {detailLoading && !detail ? (
                      <p className="text-xs text-slate-400" aria-busy="true">Cargando historial…</p>
                    ) : detailError ? (
                      <p className="text-xs text-orange-400">No se pudo cargar el historial de la alerta.</p>
                    ) : detail ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <section aria-label="Notas de la alerta">
                          <h3 className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-400">Notas</h3>
                          {detail.notes.length === 0 ? (
                            <p className="mt-2 text-xs leading-5 text-slate-500">Todavía no hay notas.</p>
                          ) : (
                            <ul className="mt-2 space-y-2">
                              {detail.notes.map((note) => (
                                <li key={note.id} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                                  <p className="whitespace-pre-wrap text-xs leading-5 text-slate-200">{note.body}</p>
                                  <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
                                    {note.author} · {timeAgo(note.created_at)}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                        <section aria-label="Auditoría de la alerta">
                          <h3 className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-400">Auditoría</h3>
                          {detail.audit.length === 0 ? (
                            <p className="mt-2 text-xs leading-5 text-slate-500">Sin eventos registrados.</p>
                          ) : (
                            <ol className="mt-2 space-y-2">
                              {detail.audit.map((event) => (
                                <li key={event.id} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                                  <p className="text-xs text-slate-200">
                                    {AUDIT_LABELS[event.action] ?? event.action} · {event.actor}
                                  </p>
                                  <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
                                    {timeAgo(event.created_at)}
                                  </p>
                                </li>
                              ))}
                            </ol>
                          )}
                        </section>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
