// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Configuración → Dispositivos (ADR-0010): alta manual y eliminación permanente.
// El token solo se muestra una vez; no se puede volver a leer desde la base.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { KeyRound, Loader2, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import type { Device, DevicesResponse, EnrollResponse } from '@/lib/api-types';
import { fetcher, FetchError } from '@/lib/swr';
import { timeAgo } from '@/lib/format';

const REFRESH_MS = 30_000;

const STATUS_STYLES: Record<string, string> = {
  active: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  enrolled_pending: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  revoked: 'text-red-400 border-red-400/40 bg-red-400/10',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  enrolled_pending: 'Pendiente de primer envío',
  revoked: 'Revocado',
};

function StatusChip({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'text-slate-400 border-white/10 bg-slate-800/60';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] ${style}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

interface IssuedToken {
  device_id: string;
  token: string;
}

export function SettingsView() {
  const { data, error, isLoading, mutate } = useSWR<DevicesResponse>('/api/devices', fetcher, {
    refreshInterval: REFRESH_MS,
  });

  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);

  const devices: Device[] = data?.devices ?? [];

  async function handleEnroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy('enroll');
    setActionError(null);
    setCopied(false);

    try {
      const response = await fetch('/api/devices/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      if (!response.ok) {
        setActionError(
          response.status === 401
            ? 'Sesión expirada: volvé a entrar para enrolar un dispositivo.'
            : `No se pudo enrolar el dispositivo (${response.status}).`
        );
        return;
      }
      const payload = (await response.json()) as EnrollResponse;
      setIssued({ device_id: payload.device_id, token: payload.token });
      setName('');
      await mutate();
    } catch {
      setActionError('Error de conexión al enrolar el dispositivo.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(device: Device) {
    if (busy) return;
    const label = device.name ?? device.id;
    const confirmed = window.confirm(
      `¿Eliminar permanentemente «${label}»? Se borrarán sus ventanas, alertas, insights y health. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setBusy(`delete:${device.id}`);
    setActionError(null);
    setCopied(false);

    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(device.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setActionError(
          response.status === 401
            ? 'Sesión expirada: volvé a entrar para eliminar el dispositivo.'
            : `No se pudo eliminar el dispositivo (${response.status}).`
        );
        return;
      }
      if (issued?.device_id === device.id) setIssued(null);
      await mutate();
    } catch {
      setActionError('Error de conexión al eliminar el dispositivo.');
    } finally {
      setBusy(null);
    }
  }

  async function copyToken() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (error instanceof FetchError && error.status === 401) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">Tu sesión expiró</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Por seguridad, la sesión de administrador dura 8 horas. Volvé a entrar para gestionar los
          dispositivos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError ? (
        <p className="flex items-start gap-2 rounded-lg border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-xs leading-5 text-orange-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      ) : null}

      <section aria-label="Enrolar dispositivo" className="rounded-xl border-slate-800/80 bg-slate-900/60">
        <header className="border-b border-slate-800/80 px-5 py-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
            Enrolar dispositivo
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">
            Genera un token permanente. Se muestra una sola vez: copialo como
            <code className="mx-1 rounded bg-slate-800 px-1 py-0.5 font-mono text-[10px]">SC_INGEST_TOKEN</code>
            en la máquina del agente, con el id del device en
            <code className="mx-1 rounded bg-slate-800 px-1 py-0.5 font-mono text-[10px]">SC_SENTINEL_DEVICE_ID</code>
            (si no coinciden, el ingest responde 403).
          </p>
        </header>

        <form onSubmit={handleEnroll} className="flex flex-wrap items-end gap-3 px-5 py-4">
          <label className="flex min-w-56 flex-1 flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-400">
              Nombre del nodo (opcional)
            </span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Equipo de casa"
              className="rounded-xl border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-400/10 px-4 py-2 font-display text-sm font-semibold text-sky-400 transition-colors hover:bg-sky-400/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
          >
            {busy === 'enroll' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            Enrolar nuevo dispositivo
          </button>
        </form>

        {issued ? (
          <div className="mx-5 mb-5 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-400">
              Token de {issued.device_id} · visible solo ahora
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded bg-slate-950/60 px-2 py-1.5 font-mono text-[11px] text-slate-100">
                {issued.token}
              </code>
              <button
                type="button"
                onClick={() => void copyToken()}
                className="rounded-xl border-slate-800/80 px-3 py-1.5 font-display text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              El token no expira. No se puede volver a consultar: guardalo en un lugar seguro. Si lo
              perdés, vas a tener que eliminar el dispositivo y enrolarlo de nuevo.
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="Dispositivos enrolados" className="rounded-xl border-slate-800/80 bg-slate-900/60">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
            Dispositivos enrolados
          </h2>
          <button
            type="button"
            onClick={() => void mutate()}
            className="inline-flex items-center gap-2 rounded-xl border-slate-800/80 px-3 py-1.5 font-display text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Actualizar
          </button>
        </header>

        <div className="px-5 py-4">
          {isLoading && !data ? (
            <div aria-busy="true" aria-label="Cargando dispositivos" className="space-y-2">
              <div className="h-10 animate-pulse rounded bg-slate-800/70" aria-hidden="true" />
              <div className="h-10 animate-pulse rounded bg-slate-800/70" aria-hidden="true" />
            </div>
          ) : error ? (
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden="true" />
              No se pudo cargar la lista de dispositivos.
            </p>
          ) : devices.length === 0 ? (
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-slate-400" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="font-display text-sm font-semibold text-slate-100">Todavía no hay dispositivos.</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Enrolá el primero arriba y usá el token en el agente. Sin un dispositivo enrolado no
                  llega ninguna ventana de tráfico y el panel queda vacío.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/60 rounded-xl border-slate-800/80">
              {devices.map((device) => (
                <li key={device.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{device.name ?? 'Sin nombre'}</p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400/70">
                      {device.id}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-400">
                      Enrolado {timeAgo(device.enrolled_at)} ·{' '}
                      {device.last_seen_at ? `último envío ${timeAgo(device.last_seen_at)}` : 'sin envíos aún'}
                    </p>
                  </div>
                  <StatusChip status={device.status} />
                  <button
                    type="button"
                    onClick={() => void handleDelete(device)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-orange-400/30 px-3 py-1.5 font-display text-xs font-semibold text-orange-400 transition-colors hover:bg-orange-400/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"
                  >
                    {busy === `delete:${device.id}` ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    )}
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
