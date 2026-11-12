// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client'

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Loader2, LockKeyhole } from 'lucide-react';

type LoginMode = 'operator' | 'admin' | 'guest';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<LoginMode>('operator');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const isGuest = mode === 'guest';
  const isOperator = mode === 'operator';

  function switchMode(next: LoginMode) {
    if (submitting || next === mode) return;
    setMode(next);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(isGuest ? '/api/auth/guest-login' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isGuest
            ? deviceId.trim()
              ? { deviceId: deviceId.trim() }
              : {}
            : isOperator
              ? { email: email.trim(), password, rememberMe }
              : { password, rememberMe }
        ),
      });

      if (response.ok) {
        const next = searchParams.get('next');
        const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/overview';
        router.replace(target);
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (isGuest) {
        if (response.status === 403) {
          setError('Ese dispositivo no está habilitado para la demo.');
        } else if (response.status === 404) {
          setError('La demo todavía no tiene un dispositivo disponible.');
        } else if (response.status === 429) {
          setError('Demasiados intentos. Esperá un minuto y reintentá.');
        } else {
          setError('No se pudo iniciar la demo.');
        }
      } else {
        setError(
          body?.error === 'invalid_credentials'
            ? isOperator
              ? 'Email o contraseña incorrectos.'
              : 'Contraseña incorrecta.'
            : 'No se pudo iniciar sesión. Revisá la configuración del servidor.'
        );
      }
    } catch {
      setError('No hay conexión con el servidor. Reintentá en unos segundos.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
      <div
        role="group"
        aria-label="Tipo de acceso"
        className="grid grid-cols-3 gap-1 rounded-md border sc-hairline bg-sc-surface p-1"
      >
        {(['operator', 'admin', 'guest'] as const).map((option) => {
          const active = mode === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => switchMode(option)}
              disabled={submitting}
              className={`rounded px-3 py-2 font-display text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 disabled:opacity-60 ${
                active
                  ? 'border border-sc-viz-in/25 bg-sc-viz-in/10 text-sc-viz-in'
                  : 'border border-transparent text-sc-text-muted hover:bg-sc-surface-alt hover:text-sc-text'
              }`}
            >
              {option === 'operator' ? 'Operador' : option === 'admin' ? 'Admin' : 'Visitante'}
            </button>
          );
        })}
      </div>

      {isGuest ? (
        <div className="space-y-3">
          <label htmlFor="guest-device" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-sc-text-muted">
            Dispositivo de demostración (opcional)
          </label>
          <input
            id="guest-device"
            name="guest-device"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
            className="w-full rounded-md border sc-hairline bg-sc-surface px-4 py-3 font-mono text-[13px] text-sc-text outline-none transition-colors placeholder:text-sc-text-muted/60 hover:border-sc-text-muted/30 focus-visible:border-sc-viz-in focus-visible:ring-2 focus-visible:ring-sc-viz-in/30"
            placeholder="dev_… (vacío = demo por defecto)"
          />
          <p className="text-xs leading-5 text-sc-text-muted">
            Solo se permite el dispositivo habilitado por el administrador.
          </p>
          <p className="flex items-start gap-2 rounded-md border border-sc-warn/25 bg-sc-warn/5 px-3 py-2 text-xs leading-5 text-sc-warn">
            <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Demo pública de solo lectura, sin registro. La sesión dura 1 hora.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {isOperator ? (
            <div>
              <label htmlFor="email" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-sc-text-muted">
                Email del operador
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border sc-hairline bg-sc-surface px-4 py-3 text-[15px] text-sc-text outline-none transition-colors placeholder:text-sc-text-muted/60 hover:border-sc-text-muted/30 focus-visible:border-sc-viz-in focus-visible:ring-2 focus-visible:ring-sc-viz-in/30"
                placeholder="operador@empresa.com"
              />
            </div>
          ) : null}
          <label htmlFor="password" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-sc-text-muted">
            {isOperator ? 'Contraseña' : 'Contraseña de administrador'}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus={!isOperator}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border sc-hairline bg-sc-surface px-4 py-3 text-[15px] text-sc-text outline-none transition-colors placeholder:text-sc-text-muted/60 hover:border-sc-text-muted/30 focus-visible:border-sc-viz-in focus-visible:ring-2 focus-visible:ring-sc-viz-in/30"
            placeholder="•••••••••••8"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remember-me"
              name="rememberMe"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 cursor-pointer rounded-md border sc-hairline bg-sc-surface sc-focus-in focus-visible:ring-2 focus-visible:ring-sc-viz-in/30"
            />
            <label htmlFor="remember-me" className="font-mono text-[10px] text-sc-text-muted">
              Recordarme
            </label>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="rounded-md border border-sc-risk-critical/30 bg-sc-risk-critical/10 px-4 py-3 text-sm leading-5 text-sc-risk-critical">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || (!isGuest && password.length === 0) || (isOperator && !email.trim())}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-sc-viz-in/40 bg-sc-viz-in/10 px-4 py-3 font-display text-[15px] font-semibold text-sc-viz-in transition-all hover:bg-sc-viz-in/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : isGuest ? (
          <Eye className="size-4" aria-hidden="true" />
        ) : (
          <LockKeyhole className="size-4" aria-hidden="true" />
        )}
        {submitting ? 'Verificando…' : isGuest ? 'Entrar como visitante' : 'Entrar'}
      </button>
    </form>
  );
}
