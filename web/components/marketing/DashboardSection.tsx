// SC-Sentinel — Sección "Dashboard en acción" para la landing page.
// Explica cada card/vista del dashboard con descripción textual + mockup interactivo.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import DashboardPreview from "./DashboardPreview";

// Descripción de cada card del dashboard (spec §18.2 + dashboard-wireframes.md)
const CARDS = [
  {
    icon: "▦",
    name: "Overview",
    color: "#38bdf8",
    headline: "El estado de tu red en un vistazo",
    description:
      "Muestra el estado del agente (online/offline/degraded), el último snapshot recibido, un gráfico de tráfico bytes in/out en el rango temporal seleccionado, los 5 hosts con más actividad y las alertas más recientes. El estado de la IA también se refleja aquí.",
    pills: ["Agente status", "Bytes in/out chart", "Top 5 hosts", "Alertas recientes", "Estado IA"],
  },
  {
    icon: "⬡",
    name: "Hosts",
    color: "#a78bfa",
    headline: "Tabla completa de hosts monitoreados",
    description:
      "Tabla con filtros por host, país y nivel de riesgo mínimo. Columnas ordenables: IP anonimizada (hash), país, bytes entrantes y salientes, paquetes, nivel de riesgo y última actividad. Con anonimización activa, la IP real nunca sale del equipo local.",
    pills: ["Filtros dinámicos", "Host hash anonimizado", "Riesgo por host", "Sortable"],
  },
  {
    icon: "◈",
    name: "Alertas",
    color: "#f97316",
    headline: "Cada alerta incluye los hechos que la dispararon",
    description:
      "Tabla con filtros por severidad, regla y estado (open / acknowledged / resolved). Al hacer clic en una alerta se expande la evidencia: volúmenes, consultas, picos y valores concretos. Las alertas no son opiniones — son el resultado determinista del motor de reglas.",
    pills: ["Evidence adjunta", "Lifecycle open→resolved", "Filtros severity/regla", "Acknowledge / resolve"],
  },
  {
    icon: "◎",
    name: "Panel IA",
    color: "#8b5cf6",
    headline: "IA que resume tendencias, no que decide por ti",
    description:
      "Muestra el resumen del último análisis por lotes (máximo cada 5 minutos), el modelo utilizado, el nivel de riesgo global, los hallazgos detectados y las recomendaciones sugeridas. Los hechos que ingirió la IA son expandibles. Si la IA no está disponible, el motor determinista sigue activo.",
    pills: ["Análisis por lotes", "Risk level global", "Hallazgos + recomendaciones", "Degrada elegantemente"],
  },
  {
    icon: "⊛",
    name: "Ajustes",
    color: "#10b981",
    headline: "Control total sobre privacidad y sincronización",
    description:
      "Gestión del token de dispositivo (rotación en 2 pasos, visible solo al crear). Toggle de anonimización de hosts. Estado de sincronización del agente (idle / sending / backoff / dead_letter). Métricas de salud del agente y retención configurada.",
    pills: ["Token rotante", "Anonimizar hosts", "Estado de sync", "Salud del agente"],
  },
];

export default function DashboardSection() {
  return (
    <section aria-labelledby="dashboard-section" className="border-b sc-hairline">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {/* Encabezado */}
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
          Dashboard en acción
        </p>
        <h2
          id="dashboard-section"
          className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
        >
          Seis vistas. Un solo panel. Todo lo que necesitás para decidir.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-sc-text-muted">
          El dashboard de SC-Sentinel organiza la información en vistas especializadas. Interactuá con el
          mockup para explorar cada una.
        </p>

        {/* CTA al dashboard */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md bg-sc-accent px-5 py-2.5 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
          >
            Ir al Dashboard
            <span aria-hidden="true">→</span>
          </a>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">
            Requiere autenticación de administrador
          </span>
        </div>

        {/* Mockup interactivo */}
        <div className="mt-10">
          <DashboardPreview />
        </div>

        {/* Grid de cards explicativas */}
        <div className="mt-14">
          <p className="mb-6 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Qué hace cada sección
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => (
              <article
                key={card.name}
                className="rounded-xl border sc-hairline bg-sc-panel/60 p-5 transition-colors hover:border-sc-accent/25"
              >
                {/* Ícono + nombre */}
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold"
                    style={{ background: `${card.color}18`, color: card.color }}
                    aria-hidden="true"
                  >
                    {card.icon}
                  </span>
                  <span className="font-display text-sm font-semibold text-sc-text">
                    {card.name}
                  </span>
                </div>

                {/* Headline */}
                <h3 className="mt-3 font-display text-base font-semibold leading-snug text-sc-text">
                  {card.headline}
                </h3>

                {/* Descripción */}
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
                  {card.description}
                </p>

                {/* Pills */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.pills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"
                      style={{
                        background: `${card.color}12`,
                        color: card.color,
                        border: `1px solid ${card.color}30`,
                      }}
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </article>
            ))}

            {/* Card extra: Connections */}
            <article className="rounded-xl border sc-hairline bg-sc-panel/60 p-5 transition-colors hover:border-sc-accent/25">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold"
                  style={{ background: "rgba(56,189,248,0.10)", color: "#38bdf8" }}
                  aria-hidden="true"
                >
                  ◉
                </span>
                <span className="font-display text-sm font-semibold text-sc-text">Conexiones</span>
              </div>
              <h3 className="mt-3 font-display text-base font-semibold leading-snug text-sc-text">
                Distribución de tráfico por puerto y país
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
                Vista de conexiones agregadas por puerto/protocolo y distribución geográfica de países. No
                muestra flujos individuales — solo conteos ya agregados por el motor local.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Top puertos/protocolo", "País distribution", "Solo agregados", "Sin flujos raw"].map(
                  (pill) => (
                    <span
                      key={pill}
                      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"
                      style={{
                        background: "rgba(56,189,248,0.10)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56,189,248,0.25)",
                      }}
                    >
                      {pill}
                    </span>
                  )
                )}
              </div>
            </article>
          </div>
        </div>

        {/* CTA secundario al dashboard */}
        <div className="mt-10 flex justify-center">
          <a
            href="/dashboard"
            className="group inline-flex items-center gap-2 rounded-xl border sc-hairline bg-sc-panel/80 px-6 py-4 text-sm font-semibold text-sc-text transition-all hover:border-sc-accent/40 hover:bg-sc-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
              style={{ background: "rgba(56,189,248,0.12)", color: "#38bdf8" }}
            >
              ◈
            </span>
            <div className="text-left">
              <span className="block">Abrir el Dashboard</span>
              <span className="block font-mono text-[10px] font-normal uppercase tracking-widest text-sc-text-muted">
                sc-sentinel.vercel.app/dashboard
              </span>
            </div>
            <span className="text-sc-accent transition-transform group-hover:translate-x-0.5">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

