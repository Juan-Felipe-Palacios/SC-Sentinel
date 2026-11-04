// SC-Sentinel — formulario de contacto público (client component).
// Valida con el mismo Zod del servidor; honeypot oculto; sin guardar borrado en el cliente.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { ContactSchema, RATE_LIMIT_PER_HOUR } from '@/lib/contact/schema';

type FieldName = 'nombre' | 'email' | 'asunto' | 'mensaje';
type FieldErrors = Partial<Record<FieldName, string>>;

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const inputClass =
  'w-full rounded-md border sc-hairline bg-sc-surface px-4 py-3 text-[15px] text-sc-text outline-none transition-colors placeholder:text-sc-text-muted/60 hover:border-sc-text-muted/30 focus-visible:border-sc-viz-in focus-visible:ring-2 focus-visible:ring-sc-viz-in/30';

const inputErrorClass =
  'border-sc-risk-critical/50 focus-visible:border-sc-risk-critical focus-visible:ring-sc-risk-critical/30';

function inputClassFor(hasError: boolean): string {
  return hasError ? `${inputClass} ${inputErrorClass}` : inputClass;
}

const labelClass =
  'mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-sc-text-muted';

const examples: Array<[FieldName, string]> = [
  ['nombre', 'Tu nombre'],
  ['email', 'tu@empresa.com'],
  ['asunto', 'Ej.: demo / soporte técnico / prensa'],
  ['mensaje', 'Describe tu caso: red, despliegue, volumen'],
];

export function ContactForm() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  function firstError(issues: Array<{ path: PropertyKey[]; message: string }>, field: FieldName): string | undefined {
    return issues.find((issue) => issue.path[0] === field)?.message;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === 'submitting') return;

    setFormError(null);
    setFieldErrors({});

    const candidate = { nombre, email, asunto, mensaje, website };
    const parsed = ContactSchema.safeParse(candidate);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const field of ['nombre', 'email', 'asunto', 'mensaje'] as FieldName[]) {
        const message = firstError(parsed.error.issues, field);
        if (message) nextErrors[field] = message;
      }
      setFieldErrors(nextErrors);
      setFormError('Revisa los campos marcados antes de enviar.');
      return;
    }

    setSubmitState('submitting');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (response.ok) {
        setSubmitState('success');
        return;
      }

      const body = (await response.json().catch(() => null)) as
        | { error?: string; issues?: Record<string, string>; retryAfter?: number }
        | null;

      if (response.status === 429) {
        setFormError(
          `Demasiados mensajes desde esta red (máximo ${RATE_LIMIT_PER_HOUR} por hora). Espera ~${Math.ceil(
            (body?.retryAfter ?? 3600) / 60
          )} min o escribe a contacto@strategicconnex.com.ar.`
        );
        setSubmitState('error');
        return;
      }

      if (response.status === 400 && body?.issues) {
        const serverErrors: FieldErrors = {};
        for (const field of ['nombre', 'email', 'asunto', 'mensaje'] as FieldName[]) {
          const message = body.issues[field];
          if (message) serverErrors[field] = message;
        }
        setFieldErrors(serverErrors);
        setFormError('El servidor rechazó algunos campos. Revisa el formulario.');
        setSubmitState('error');
        return;
      }

      setFormError('No se pudo enviar el mensaje. Intenta de nuevo en unos segundos.');
      setSubmitState('error');
    } catch {
      setFormError('No hay conexión con el servidor. Intenta de nuevo en unos segundos.');
      setSubmitState('error');
    }
  }

  if (submitState === 'success') {
    return (
      <div
        role="status"
        className="rounded-lg border border-sc-viz-in/30 bg-sc-viz-in/5 p-6 text-center"
      >
        <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-sc-viz-in" />
        <h3 className="mt-4 font-display text-xl font-semibold tracking-tight text-sc-text">
          Mensaje recibido
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-sc-text-muted">
          Respondemos en ≤ 1 día hábil. Si el tema es urgente, escribe a{' '}
          <a
            href="mailto:contacto@strategicconnex.com.ar"
            className="font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
          >
            contacto@strategicconnex.com.ar
          </a>.
        </p>
        <button
          type="button"
          onClick={() => {
            setNombre('');
            setEmail('');
            setAsunto('');
            setMensaje('');
            setWebsite('');
            setSubmitState('idle');
          }}
          className="mt-5 rounded-md border sc-hairline bg-sc-panel/60 px-4 py-2 text-sm font-semibold text-sc-text transition-colors hover:border-sc-accent/40 hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Formulario de contacto">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="nombre">Nombre</label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            autoComplete="name"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-invalid={Boolean(fieldErrors.nombre)}
            aria-describedby={fieldErrors.nombre ? 'nombre-error' : undefined}
            className={inputClassFor(Boolean(fieldErrors.nombre))}
            placeholder={examples[0][1]}
          />
          {fieldErrors.nombre ? (
            <p id="nombre-error" role="alert" className="mt-2 text-xs text-sc-risk-critical">{fieldErrors.nombre}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={inputClassFor(Boolean(fieldErrors.email))}
            placeholder={examples[1][1]}
          />
          {fieldErrors.email ? (
            <p id="email-error" role="alert" className="mt-2 text-xs text-sc-risk-critical">{fieldErrors.email}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="asunto">Asunto</label>
        <input
          id="asunto"
          name="asunto"
          type="text"
          required
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          aria-invalid={Boolean(fieldErrors.asunto)}
          aria-describedby={fieldErrors.asunto ? 'asunto-error' : undefined}
          placeholder={examples[2][1]}
          className={inputClassFor(Boolean(fieldErrors.asunto))}
        />
        {fieldErrors.asunto ? (
          <p id="asunto-error" role="alert" className="mt-2 text-xs text-sc-risk-critical">{fieldErrors.asunto}</p>
        ) : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="mensaje">Mensaje</label>
        <textarea
          id="mensaje"
          name="mensaje"
          required
          rows={5}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          aria-invalid={Boolean(fieldErrors.mensaje)}
          aria-describedby={fieldErrors.mensaje ? 'mensaje-error' : undefined}
          placeholder={examples[3][1]}
          className={inputClassFor(Boolean(fieldErrors.mensaje))}
        />
        {fieldErrors.mensaje ? (
          <p id="mensaje-error" role="alert" className="mt-2 text-xs text-sc-risk-critical">{fieldErrors.mensaje}</p>
        ) : null}
      </div>

      {/* Honeypot: oculto para humanos, visible para bots que escanean el DOM. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {formError ? (
        <p role="alert" className="rounded-md border border-sc-risk-critical/30 bg-sc-risk-critical/10 px-4 py-3 text-sm leading-5 text-sc-risk-critical">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">
          Máximo {RATE_LIMIT_PER_HOUR} mensajes por hora desde tu IP
        </p>
        <button
          type="submit"
          disabled={submitState === 'submitting'}
          className="inline-flex items-center gap-2 rounded-md border border-sc-viz-in/40 bg-sc-viz-in/10 px-5 py-3 font-display text-[15px] font-semibold text-sc-viz-in transition-all hover:bg-sc-viz-in/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitState === 'submitting' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {submitState === 'submitting' ? 'Enviando…' : 'Enviar mensaje'}
        </button>
      </div>
    </form>
  );
}
