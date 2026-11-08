// SC-Sentinel — Sección "Beneficios de IA" para la landing page.
// Explica por qué un motor determinista + IA asistente es la combinación correcta.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

const AI_BENEFITS = [
  {
    icon: "🧠",
    title: "Comprende el contexto histórico",
    body: "La IA analiza lotes de señales agregadas a lo largo del tiempo, identifica tendencias que el motor determinista no detecta por sí solo y correlaciona eventos de distintas ventanas temporales.",
  },
  {
    icon: "📋",
    title: "Resume sin abrumar",
    body: "En lugar de mostrarte miles de métricas, el análisis sintetiza el estado en un nivel de riesgo global, hallazgos priorizados y recomendaciones accionables.",
  },
  {
    icon: "⚖️",
    title: "El motor decide; la IA explica",
    body: "Ninguna alerta es disparada por la IA. Las reglas deterministas son la única fuente de alertas. La IA ayuda a interpretar los patrones que ya detectó el motor.",
  },
  {
    icon: "🔒",
    title: "Solo recibe hechos agregados",
    body: "La IA nunca ve paquetes crudos ni IPs sin anonimizar. Opera sobre los mismos datos que ven el dashboard: conteos, hashes y métricas agregadas.",
  },
  {
    icon: "⚡",
    title: "Degrada elegantemente",
    body: "Si la IA no está disponible, el sistema sigue funcionando. El motor determinista continúa generando alertas y el dashboard sigue actualizado en tiempo real.",
  },
  {
    icon: "🕐",
    title: "Cadencia controlada",
    body: "Hasta un análisis cada 15 minutos. El sistema usa caché para evitar llamadas innecesarias y mantener el costo operativo bajo control.",
  },
];

const COMPARISON = [
  {
    aspect: "Fuente de alertas",
    determinista: "Motor de reglas explícitas (always on)",
    ia: "No genera alertas — solo interpreta",
  },
  {
    aspect: "Visibilidad",
    determinista: "Cada disparo tiene regla + evidencia",
    ia: "Resume tendencias entre ventanas",
  },
  {
    aspect: "Datos que ve",
    determinista: "Paquetes crudos en el equipo local",
    ia: "Solo señales agregadas (nunca raw)",
  },
  {
    aspect: "Disponibilidad",
    determinista: "100% offline-first (siempre activo)",
    ia: "Best-effort (degrada con gracia)",
  },
  {
    aspect: "Cadencia",
    determinista: "Ventanas de 30 segundos",
    ia: "Lotes de hasta 6 horas, máx. 1/5 min",
  },
];

export default function AIBenefitsSection() {
  return (
    <section aria-labelledby="ai-benefits" className="border-b sc-hairline bg-sc-panel/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {/* Encabezado */}
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
          Inteligencia Artificial
        </p>
        <h2
          id="ai-benefits"
          className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
        >
          IA que amplifica tu visibilidad. No que reemplaza tu juicio.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-sc-text-muted">
          SC-Sentinel combina un motor determinista de reglas con análisis de IA por lotes. El motor detecta;
          la IA interpreta y sintetiza. Nunca al revés.
        </p>

        {/* Grid de beneficios */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AI_BENEFITS.map((b) => (
            <div
              key={b.title}
              className="rounded-xl border sc-hairline bg-sc-bg/50 p-5 transition-colors hover:border-sc-degraded/30"
            >
              <span className="text-2xl" aria-hidden="true">
                {b.icon}
              </span>
              <h3 className="mt-3 font-display text-base font-semibold leading-snug text-sc-text">
                {b.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{b.body}</p>
            </div>
          ))}
        </div>

        {/* Tabla comparativa determinista vs IA */}
        <div className="mt-14">
          <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Motor determinista vs. IA asistente
          </p>
          <div
            className="overflow-hidden rounded-xl border sc-hairline"
            role="table"
            aria-label="Comparación entre motor determinista e IA asistente"
          >
            {/* Header */}
            <div
              className="grid grid-cols-3 gap-px border-b sc-hairline px-4 py-3"
              style={{ background: "var(--color-sc-surface-alt)" }}
              role="row"
            >
              <span
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted"
                role="columnheader"
              >
                Aspecto
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-accent"
                role="columnheader"
              >
                Motor determinista
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-degraded"
                role="columnheader"
              >
                IA asistente
              </span>
            </div>

            {COMPARISON.map((row, i) => (
              <div
                key={row.aspect}
                className="grid grid-cols-3 gap-px px-4 py-3"
                style={{
                  borderTop: i > 0 ? "1px solid var(--color-sc-panel)" : undefined,
                  background: i % 2 === 0 ? "var(--color-sc-surface)" : "var(--color-sc-panel)",
                }}
                role="row"
              >
                <span
                  className="font-mono text-[11px] text-sc-text-muted self-center"
                  role="cell"
                >
                  {row.aspect}
                </span>
                <span className="text-sm leading-relaxed text-sc-text self-center" role="cell">
                  {row.determinista}
                </span>
                <span
                  className="text-sm leading-relaxed self-center"
                  style={{ color: "var(--color-sc-degraded)" }}
                  role="cell"
                >
                  {row.ia}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Badge de modelo */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: "rgba(139,92,246,0.4)",
              color: "var(--color-sc-degraded)",
              background: "rgba(139,92,246,0.08)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-sc-degraded)" }} />
            Powered by Gemini 2.0 Flash
          </span>
          <span className="text-sm text-sc-text-muted">
            Degradación elegante — si el modelo no responde, el motor determinista sigue protegiendo.
          </span>
        </div>
      </div>
    </section>
  );
}

