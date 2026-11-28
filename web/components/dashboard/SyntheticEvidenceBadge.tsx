// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Aviso de la demo (M6 · E9): las alertas del dataset sintético llevan
// `evidence.demo === true` y muestran este chip. Una alerta real nunca lo tiene.

export function SyntheticEvidenceBadge({
  evidence,
}: {
  evidence: Record<string, unknown> | null;
}) {
  if (!evidence || evidence.demo !== true) return null;

  return (
    <span className="inline-flex w-fit items-center rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-300">
      Evidencia sintética
    </span>
  );
}
