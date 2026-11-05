// SC-Sentinel - Home pública — landing page completa con dashboard preview y IA.
// Fuente de copy: docs/ux/copywriting.md + docs/ux/landing-sitemap.md (spec §18.1).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import ArchitectureDiagram from "@/components/marketing/ArchitectureDiagram";
import DashboardSection from "@/components/marketing/DashboardSection";
import AIBenefitsSection from "@/components/marketing/AIBenefitsSection";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Monitoreo de red con motor local",
  description:
    "SC-Sentinel analiza tu tráfico localmente con un motor determinista y publica solo señales agregadas a tu dashboard. Cuando algo raro sucede, te enteras con evidencia.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/",
  },
  openGraph: {
    title: "SC-Sentinel — Ve lo que pasa en tu red",
    description:
      "Motor determinista local + señales agregadas a la nube. Paquetes crudos, nunca.",
    url: "https://sc-sentinel.vercel.app/",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SC-Sentinel — motor local, señales agregadas" }],
  },
};

const features = [
  {
    icon: "⚙",
    color: "#38bdf8",
    title: "Reglas concretas, no cajas negras",
    body: "Miles de servicios reconocidos, geo por país, blacklist y umbrales — todo corre localmente y puede explicar exactamente por qué dispara.",
  },
  {
    icon: "🔒",
    color: "#10b981",
    title: "Tu IP real nunca sale de tu red",
    body: "Modo de anonimización integrado: la nube ve claves hasheadas y conteos; no paquetes ni flujos individuales.",
  },
  {
    icon: "📋",
    color: "#f97316",
    title: "Cada alerta trae sus hechos",
    body: "Verás los datos que dispararon la alerta (volumen, consultas, picos) y podrás marcarlas como revisadas.",
  },
  {
    icon: "◎",
    color: "#8b5cf6",
    title: "IA que ayuda, no que decide",
    body: "El análisis de IA resume tendencias y sugiere pasos; funciona por lotes y degrada elegantemente si no está disponible.",
  },
  {
    icon: "💾",
    color: "#f59e0b",
    title: "Tus datos no se pierden",
    body: "Si la conexión cae, el agente guarda todo en un spool local hasta reconectar.",
  },
  {
    icon: "☁",
    color: "#a78bfa",
    title: "Vercel + Neon, costo casi cero",
    body: "Dashboard propio sin servidores que mantener: deploy único en Vercel con base de datos Neon serverless.",
  },
];

const steps = [
  {
    n: "01",
    icon: "⬛",
    title: "Captura local",
    body: "El agente observa el tráfico en tu PC (o en tu router, vía NetFlow/IPFIX). Ningún paquete crudo sale del equipo.",
  },
  {
    n: "02",
    icon: "⚙",
    title: "Agregación determinista",
    body: "Ventanas de 30 segundos resumen qué hosts, puertos y países dominan el tráfico; el motor local detecta anomalías con reglas concretas.",
  },
  {
    n: "03",
    icon: "◈",
    title: "Dashboard + IA",
    body: "La nube solo recibe esas señales agregadas; la IA analiza tendencias y sugiere acciones (máx. 1 análisis cada 5 minutos).",
  },
];

const securityBullets = [
  "Autenticación por token rotante con SHA-256",
  "Secretos solo en el servidor — nunca en el cliente",
  "Logs sin datos sensibles ni IPs sin anonimizar",
  "Retención estricta con limpieza diaria automática",
  "Dashboard detrás de cookie de administración firmada",
  "Comunicación agente → nube cifrada con TLS 1.3",
];

export default function MarketingHome() {
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="sc-grid-bg border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Copy */}
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
                SC-Sentinel · Strategic Connex Anomaly Shield
              </p>
              <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-sc-text sm:text-5xl lg:text-6xl">
                Ve lo que pasa en tu red. Sin enviar paquetes crudos a la nube.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-sc-text-muted">
                SC-Sentinel analiza tu tráfico localmente con un motor determinista y publica solo señales
                agregadas a tu dashboard. Cuando algo raro sucede, te enteras con evidencia.
              </p>

              {/* CTAs — Dashboard primero */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-md bg-sc-accent px-5 py-3 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  Ir al Dashboard
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/contacto"
                  className="rounded-md border sc-hairline bg-sc-panel/60 px-5 py-3 text-sm font-semibold text-sc-text transition-colors hover:border-sc-accent/40 hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  Contactar
                </Link>
                <Link
                  href="/funcionalidades"
                  className="rounded-md px-5 py-3 text-sm font-medium text-sc-text-muted transition-colors hover:text-sc-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  Conocer funcionalidades
                </Link>
              </div>

              {/* Trust strip */}
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
                {["Motor local", "No paquetes crudos", "Alertas con evidencia", "IA asistente"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 font-mono text-[11px] text-sc-text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-sc-ok" aria-hidden="true" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Panel hero — mockup de ventana de snapshot */}
            <div
              aria-hidden="true"
              className="overflow-hidden rounded-xl border sc-hairline bg-sc-panel/80 shadow-[0_0_80px_rgba(56,189,248,0.07)]"
            >
              {/* Barra de título del "navegador" */}
              <div className="flex items-center justify-between border-b sc-hairline px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sc-risk-critical/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-sc-warn/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-sc-ok/70" />
                </div>
                <div className="flex items-center gap-1.5 rounded-md border sc-hairline bg-sc-bg/80 px-3 py-1">
                  <span className="text-[9px] text-sc-ok">🔒</span>
                  <p className="font-mono text-[10px] text-sc-text-muted">
                    sc-sentinel.vercel.app/dashboard
                  </p>
                </div>
                <span className="font-mono text-[10px] text-sc-text-muted">admin</span>
              </div>

              {/* Contenido del snapshot */}
              <div className="space-y-3 p-5 font-mono text-[12px] leading-6">
                {/* Estado agente */}
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-sc-text-muted">
                    <span className="sc-pulse-dot inline-block h-2 w-2 rounded-full bg-sc-ok" />
                    capture_status
                  </span>
                  <span className="text-sc-ok">online · v0.4.2</span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 border-t sc-hairline pt-3">
                  {[
                    { label: "hosts únicos", val: "142", color: "text-sc-text" },
                    { label: "alertas abiertas", val: "3", color: "text-sc-warn" },
                    { label: "análisis IA", val: "ok · 4 m", color: "text-sc-ok" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border sc-hairline bg-sc-bg/40 p-2.5">
                      <p className="text-[10px] text-sc-text-muted">{s.label}</p>
                      <p className={`mt-1 text-sm font-semibold tabular-nums ${s.color}`}>{s.val}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-4 border-t sc-hairline pt-3">
                  <span className="text-sc-text-muted">top_países</span>
                  <span className="text-sc-text">🇦🇷 AR 38% · 🇺🇸 US 21% · 🇩🇪 DE 9%</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t sc-hairline pt-3">
                  <span className="text-sc-text-muted">top_puertos</span>
                  <span className="text-sc-text">443 · 80 · 53</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t sc-hairline pt-3">
                  <span className="text-sc-text-muted">alerta_activa</span>
                  <span className="text-sc-warn">▲ pico volumen h_e7a211 (hechos adjuntos)</span>
                </div>
              </div>

              <div className="border-t sc-hairline px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-sc-text-muted">
                Solo agregados salieron del equipo · 0 paquetes crudos
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PROBLEMA ===== */}
      <section aria-labelledby="problema" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            El problema
          </p>
          <h2
            id="problema"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Hoy sabés que tu red «funciona». No sabés qué pasa adentro.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Tráfico invisible",
                body: "El flujo que entra y sale de cada equipo ocurre todo el día, pero la mayoría de los dashboards no muestran nada hasta después del incidente.",
              },
              {
                title: "Herramientas que piden demasiado",
                body: "Muchos monitores quieren ver todo: paquetes completos, IPs, payloads. En la mayoría de los entornos eso es un consentimiento que nadie firmó.",
              },
              {
                title: "Alertas sin hechos",
                body: "Un aviso que no explica por qué disparó te obliga a confiar en la herramienta. La evidencia debería ser el primer dato, no el opcional.",
              },
            ].map((p) => (
              <div key={p.title} className="rounded-xl border sc-hairline bg-sc-bg/50 p-5">
                <h3 className="font-display text-base font-semibold text-sc-text">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SOLUCIÓN (features) ===== */}
      <section aria-labelledby="solucion" className="border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            La solución
          </p>
          <h2
            id="solucion"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Determinista primero. IA como ayuda, nunca como juez.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article
                key={f.title}
                className="rounded-xl border sc-hairline bg-sc-panel/60 p-6 transition-colors hover:border-sc-accent/30"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
                  style={{ background: `${f.color}18`, color: f.color }}
                  aria-hidden="true"
                >
                  {f.icon}
                </span>
                <h3 className="mt-4 font-display text-base font-semibold tracking-tight text-sc-text">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== DASHBOARD EN ACCIÓN + CARDS EXPLICATIVAS ===== */}
      <DashboardSection />

      {/* ===== CÓMO FUNCIONA ===== */}
      <section aria-labelledby="como-funciona" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Cómo funciona
          </p>
          <h2
            id="como-funciona"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Tres pasos, ninguna caja negra.
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.n}
                className="relative rounded-xl border sc-hairline bg-sc-bg/50 p-6"
              >
                {/* Conector → */}
                {i < steps.length - 1 && (
                  <span
                    className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-sc-accent md:block"
                    aria-hidden="true"
                  >
                    →
                  </span>
                )}
                <span aria-hidden="true" className="font-mono text-3xl font-semibold text-sc-accent/70">
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold text-sc-text">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== BENEFICIOS DE IA ===== */}
      <AIBenefitsSection />

      {/* ===== ARQUITECTURA RESUMIDA ===== */}
      <section aria-labelledby="arquitectura" className="border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Arquitectura resumida
          </p>
          <h2
            id="arquitectura"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Agente local → agregación → dashboard. Nada más.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-sc-text-muted">
            El motor determinista decide qué es anómalo con reglas explícitas; la IA solo recibe hechos ya
            agregados, una vez cada 5 minutos como máximo.
          </p>
          <div className="mt-10">
            <ArchitectureDiagram />
          </div>
        </div>
      </section>

      {/* ===== PRIVACIDAD ===== */}
      <section aria-labelledby="privacidad" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-ok">
                Privacidad
              </p>
              <h2
                id="privacidad"
                className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
              >
                La nube recibe señales agregadas, no paquetes crudos.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-sc-text-muted">
                Con la anonimización activada, la dirección IP de tu red no sale del equipo. El dashboard muestra
                lo necesario para decidir: tendencias, picos y alertas con hechos.
              </p>
            </div>

            {/* Bullets de seguridad */}
            <div className="rounded-xl border sc-hairline bg-sc-bg/50 p-6">
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">
                Postura de seguridad
              </p>
              <ul className="space-y-2.5">
                {securityBullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full bg-sc-ok/15 text-center text-[10px] leading-4 text-sc-ok">
                      ✓
                    </span>
                    <span className="text-sm text-sc-text-muted">{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t sc-hairline pt-4">
                <Link
                  href="/security"
                  className="font-mono text-[11px] text-sc-accent hover:underline"
                >
                  Ver postura de seguridad completa →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section aria-labelledby="cta-final">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl border sc-hairline bg-sc-panel/70 px-6 py-14 text-center sm:px-12">
            {/* Glow decorativo */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(56,189,248,0.07), transparent 70%)",
              }}
            />

            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
              Empezar
            </p>
            <h2
              id="cta-final"
              className="mx-auto mt-4 max-w-2xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl lg:text-4xl"
            >
              Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes
              crudos.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-sc-text-muted">
              Accedé al dashboard y al panel de IA desde tu navegador. Sin servidores que mantener.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md bg-sc-accent px-7 py-3 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
              >
                Ir al Dashboard
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/contacto"
                className="rounded-md border sc-hairline px-7 py-3 text-sm font-semibold text-sc-text transition-colors hover:border-sc-accent/40 hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
              >
                Contactar
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {["Motor local siempre activo", "Alertas con evidencia", "IA asistente por lotes", "Privacidad por diseño"].map(
                (t) => (
                  <span key={t} className="flex items-center gap-1.5 font-mono text-[11px] text-sc-text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-sc-ok" aria-hidden="true" />
                    {t}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
