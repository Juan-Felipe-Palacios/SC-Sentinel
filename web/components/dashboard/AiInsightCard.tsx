// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Panel «Análisis IA» (M3 Task 10): SWR cada 30 s (D8) sobre /api/query?metric=ai.
// Estado degradado honesto (ADR-0005): nunca se muestran facts ni hallazgos inventados.
// Idioma: español por defecto; el selector ES/EN pide el análisis en ese idioma.
'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { BrainCircuit, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import type { AiInsight, AiInsightResponse } from '@/lib/api-types';
import { fetcher, FetchError } from '@/lib/swr';
import { timeAgo } from '@/lib/format';
import { useDashboardRole } from './DashboardRoleContext';

const REFRESH_MS = 30_000;
const LANG_STORAGE_KEY = 'sc-ai-language';

type AiLanguage = 'es' | 'en';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-red-400 border-red-400/40 bg-red-400/10',
  high: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
  medium: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  low: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  info: 'text-slate-400 border-white/10 bg-slate-800/60',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Riesgo crítico',
  high: 'Riesgo alto',
  medium: 'Riesgo medio',
  low: 'Riesgo bajo',
  info: 'Informativo',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

/** Slugs en inglés que emite el modelo → etiqueta visible en español. */
const FINDING_TYPE_LABELS: Record<string, string> = {
  traffic: 'tráfico',
  ports: 'puertos',
  alerts: 'alertas',
  host_anonymity: 'anonimización',
  health: 'salud',
  capture: 'captura',
};

function findingTypeLabel(type: string, language: AiLanguage): string {
  if (language === 'en') return type;
  return FINDING_TYPE_LABELS[type.toLowerCase()] ?? type;
}

function isInsight(value: AiInsightResponse | undefined): value is AiInsight {
  return Boolean(value && typeof (value as AiInsight).id === 'string');
}

function topSeverity(insight: AiInsight): string {
  const severities = insight.findings.map((finding) => finding.severity.toLowerCase());
  return SEVERITY_ORDER.find((severity) => severities.includes(severity)) ?? 'info';
}

/** Riesgo del panel: usa el risk_level §11.2 persistido; legacy (pre-0002) deriva del hallazgo más severo. */
function displayRisk(insight: AiInsight): string {
  return insight.risk_level ?? topSeverity(insight);
}

function Chip({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? 'text-slate-400 border-white/10 bg-slate-800/60';
  const label = SEVERITY_LABELS[severity] ?? severity;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] ${style}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

function LanguageSwitch({
  language,
  busy,
  onChange,
}: {
  language: AiLanguage;
  busy: boolean;
  onChange: (language: AiLanguage) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Idioma del análisis"
      className="inline-flex items-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-0.5"
    >
      {(['es', 'en'] as const).map((option) => {
        const active = option === language;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            disabled={busy}
            onClick={() => onChange(option)}
            className={`rounded-lg px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors disabled:cursor-wait disabled:opacity-60 ${
              active
                ? 'bg-sky-500/15 text-sky-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            {option}
          </button>
        );
      })}
      {busy ? <Loader2 className="mr-1.5 size-3 animate-spin text-purple-400" aria-hidden="true" /> : null}
    </div>
  );
}

export function AiInsightCard() {
  const { role } = useDashboardRole();
  const isGuest = role === 'guest';
  const [language, setLanguage] = useState<AiLanguage>('es');
  const [busy, setBusy] = useState(false);

  // Preferencia guardada en el navegador (español por defecto). El visitante
  // no cambia de idioma porque eso dispara el lote admin.
  useEffect(() => {
    if (isGuest) return;
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'en' || stored === 'es') setLanguage(stored);
  }, [isGuest]);

  const key = `/api/query?metric=ai&lang=${language}`;
  const { data, error, isLoading, mutate } = useSWR<AiInsightResponse>(key, fetcher, {
    refreshInterval: REFRESH_MS,
  });

  const insight = isInsight(data) ? data : null;
  const degraded = insight?.status === 'degraded';

  /** Pide el análisis en el idioma elegido y refresca el panel. */
  async function analyze(next: AiLanguage) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/ai/analyze?lang=${next}`, { method: 'POST' });
    } catch {
      // La revalidación muestra lo que haya persistido; el error se ve en el panel.
    } finally {
      setBusy(false);
    }
    await globalMutate(`/api/query?metric=ai&lang=${next}`);
  }

  async function changeLanguage(next: AiLanguage) {
    if (next === language) return;
    setLanguage(next);
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
    await analyze(next);
  }

  return (
    <section
      aria-label="Análisis asistido por IA"
      className="rounded-xl border-slate-800/80 bg-slate-900/60"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-purple-400/30 bg-purple-400/10 text-purple-400">
            <BrainCircuit className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-100">
              Análisis IA
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
              Copiloto RAG · lote cada 30 s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isGuest ? null : (
            <LanguageSwitch language={language} busy={busy} onChange={(next) => void changeLanguage(next)} />
          )}
          {insight ? <Chip severity={degraded ? 'info' : displayRisk(insight)} /> : null}
          {degraded ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-purple-400/40 bg-purple-400/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-purple-400">
              Degradado
            </span>
          ) : null}
        </div>
      </header>

      <div className="px-5 py-4">
        {isLoading && !data ? (
          <div aria-busy="true" aria-label="Cargando análisis IA" className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800/70" aria-hidden="true" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-800/70" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden="true" />
              {error instanceof FetchError && error.status === 401
                ? 'Sesión expirada: el análisis IA no se puede consultar.'
                : 'No se pudo cargar el análisis IA. El motor determinista no se ve afectado.'}
            </p>
            <button
              type="button"
              onClick={() => void mutate()}
              className="inline-flex items-center gap-2 rounded-xl border-slate-800/80 px-3 py-1.5 font-display text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Reintentar
            </button>
          </div>
        ) : !insight ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-slate-400" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="font-display text-sm font-semibold text-slate-100">
                  {language === 'es' ? 'Aún no hay análisis en español.' : 'No analysis in English yet.'}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {isGuest
                    ? 'El motor determinista sigue activo: las métricas y alertas de arriba no dependen de la IA. El análisis lo genera un administrador.'
                    : 'El motor determinista sigue activo: las métricas y alertas de arriba no dependen de la IA. Ejecutá el lote para generarlo en este idioma.'}
                </p>
              </div>
            </div>
            {isGuest ? null : (
              <button
                type="button"
                onClick={() => void analyze(language)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border-slate-800/80 px-3 py-1.5 font-display text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="size-3.5" aria-hidden="true" />
                )}
                {busy ? 'Analizando…' : 'Analizar ahora'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <p className="text-[13px] leading-6 text-slate-100">{insight.summary}</p>
            </div>

            {degraded ? (
              <p className="rounded-xl border border-purple-400/25 bg-purple-400/5 px-3 py-2 font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-purple-400">
                Sin análisis del modelo: se muestra el estado del motor determinista, sin hallazgos
                inferidos.
              </p>
            ) : null}

            {insight.findings.length > 0 ? (
              <ul className="divide-y divide-slate-800/60 rounded-xl border-slate-800/80">
                {insight.findings.map((finding, index) => (
                  <li key={`${finding.type}-${index}`} className="flex items-start gap-3 px-3 py-2.5">
                    <Chip severity={finding.severity.toLowerCase()} />
                    <p className="text-xs leading-5 text-slate-400">
                      <span className="font-medium text-slate-100">{finding.description}</span>
                      <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400/60">
                        {findingTypeLabel(finding.type, language)}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {insight.recommendations.length > 0 ? (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3.5">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                  Recomendaciones
                </p>
                <ul className="mt-2 space-y-1.5">
                  {insight.recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start gap-2 text-xs leading-5 text-slate-300">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                      {recommendation}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800/60 pt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400/70">
              <span>Modelo · {insight.model}</span>
              <span>Generado · {timeAgo(insight.created_at)}</span>
              <span title={insight.facts_hash}>Facts · {insight.facts_hash.slice(0, 8)}</span>
            </footer>
          </div>
        )}
      </div>
    </section>
  );
}
