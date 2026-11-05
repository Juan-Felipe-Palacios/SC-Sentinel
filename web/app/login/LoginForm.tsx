// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client'

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, rememberMe }),
      });

      if (response.ok) {
        const next = searchParams.get('next');
        const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/overview';
        router.replace(target);
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(
        body?.error === 'invalid_credentials'
          ? 'Contraseña incorrecta.'
          : 'No se pudo iniciar sesión. Revisá la configuración del servidor.'
      );
    } catch {
      setError('No hay conexión con el servidor. Reintentá en unos segundos.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
      <div className="space-y-3">
        <label htmlFor="password" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-sc-text-muted">
          Contraseña de administrador
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border sc-hairline bg-sc-surface px-4 py-3 text-[15px] text-sc-text outline-none transition-colors placeholder:text-sc-text-muted/60 hover:border-sc-text-muted/30 focus-visible:border-sc-viz-in focus-visible:ring-2 focus-visible:ring-sc-viz-in/30"
          placeholder="•••••••••••8"
        />

        {/* Checkbox Remember Me */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="remember-me"
            name="rememberMe"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded-md border sc-hairline bg-sc-surface w-4 h-4 sc-focus-in focus-visible:ring-2 focus-visible:ring-sc-viz-in/30 cursor-pointer"
          />
          <label htmlFor="remember-me" className="font-mono text-[10px] text-sc-text-muted">
            Recordarme
          </label>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-sc-risk-critical/30 bg-sc-risk-critical/10 px-4 py-3 text-sm leading-5 text-sc-risk-critical">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || password.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-sc-viz-in/40 bg-sc-viz-in/10 px-4 py-3 font-display text-[15px] font-semibold text-sc-viz-in transition-all hover:bg-sc-viz-in/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="size-4" aria-hidden="true" />}
        {submitting ? 'Verificando…' : 'Entrar'}
      </button>
    </form>
  );
}