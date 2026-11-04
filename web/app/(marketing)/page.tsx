// SC-Sentinel - Home pública (M3 Task 2, SSG, cero fetch en runtime).
// Fuente de copy: docs/ux/copywriting.md + docs/ux/landing-sitemap.md (spec §18.1).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import ArchitectureDiagram from "@/components/marketing/ArchitectureDiagram";

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
    images: [{ url: "/og/landing.png", width: 1200, height: 630, alt: "SC-Sentinel — motor local, señales agregadas" }],
  },
};

const features = [
  {
    title: "Reglas concretas, no cajas negras",
    body: "Miles de servicios reconocidos, geo por país, blacklist y umbrales — todo corre localmente y puede explicar exactamente por qué dispara.",
  },
  {
    title: "Tu IP real nunca sale de tu red",
    body: "Modo de anonimización integrado: la nube ve claves hasheadas y conteos; no paquetes ni flujos individuales.",
  },
  {
    title: "Cada alerta trae sus hechos",
    body: "Verás los datos que dispararon la alerta (volumen, consultas, picos) y podrás marcarlas como revisadas.",
  },
  {
    title: "IA que ayuda, no que decide",
    body: "El análisis de IA resume tendencias y sugiere pasos; funciona por lotes y degrada elegantemente si no está disponible.",
  },
  {
    title: "Tus datos no se pierden",
    body: "Si la conexión cae, el agente guarda todo en un spool local hasta reconectar.",
  },
  {
    title: "En Vercel + Neon free",
    body: "Dashboard propio sin servidores que mantener: deploy único y costo casi cero.",
  },
];

const steps = [
  {
    n: "01",
    title: "Captura local",
    body: "El agente observa el tráfico en tu PC (o en tu router, vía NetFlow/IPFIX).",
  },
  {
    n: "02",
    title: "Agregación determinista",
    body: "Ventanas de 30 segundos resumen qué hosts, puertos y países dominan el tráfico; el motor local detecta anomalías con reglas concretas.",
  },
  {
    n: "03",
    title: "Dashboard + IA",
    body: "La nube solo recibe esas señales agregadas; la IA analiza tendencias y sugiere acciones (máx. 1 análisis cada 5 minutos).",
  },
];

export default function MarketingHome() {
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="sc-grid-bg border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
                SC-Sentinel · Strategic Connex
              </p>
              <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-sc-text sm:text-5xl lg:text-6xl">
                Ve lo que pasa en tu red. Sin enviar paquetes crudos a la nube.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-sc-text-muted">
                SC-Sentinel analiza tu tráfico localmente con un motor determinista y publica solo señales agregadas a
                tu dashboard. Cuando algo raro sucede, te enteras con evidencia.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/contacto"
                  className="rounded-md bg-sc-accent px-5 py-3 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  Contactar
                </Link>
                <Link
                  href="/funcionalidades"
                  className="rounded-md border sc-hairline bg-sc-panel/60 px-5 py-3 text-sm font-semibold text-sc-text transition-colors hover:border-sc-accent/40 hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  Conocer funcionalidades
                </Link>
              </div>
              <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-sc-text-muted">
                Señales agregadas · No paquetes crudos · Motor local
              </p>
            </div>

            {/* Panel propio — maqueta de la última ventana (sin datos reales) */}
            <div
              aria-hidden="true"
              className="overflow-hidden rounded-xl border sc-hairline bg-sc-panel/80 shadow-[0_0_80px_rgba(56,189,248,0.06)]"
            >
              <div className="flex items-center justify-between border-b sc-hairline px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-sc-risk-critical/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-sc-warn/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-sc-ok/70" />
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">
                  sc-sentinel · ventana 14:32:00
                </p>
              </div>
              <div className="space-y-3 p-5 font-mono text-[12px] leading-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-sc-text-muted">
                    <span className="sc-pulse-dot inline-block h-2 w-2 rounded-full bg-sc-ok" />
                    capture_status
                  </span>
                  <span className="text-sc-ok">ok</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t sc-hairline pt-3">
                  <span className="text-sc-text-muted">hosts_únicos</span>
                  <span className="text-sc-text">142 <span className="text-sc-text-muted">hash</span></span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t sc-hairline pt-3">
                  <span className="text-sc-text-muted">top_país</span>
                  <span className="text-sc-text">AR 38% · US 21% · DE 9%</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t sc-hairline pt-3">
                  <span className="text-sc-text-muted">top_puertos</span>
                  <span className="text-sc-text">443 · 80 · 53</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t sc-hairline pt-3">
                  <span className="text-sc-text-muted">alertas</span>
                  <span className="text-sc-warn">1 · umbral volumen (hechos adjuntos)</span>
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
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">El problema</p>
          <h2 id="problema" className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl">
            Hoy sabes que tu red «funciona». No sabes qué pasa adentro.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <p className="rounded-lg border sc-hairline bg-sc-bg/50 p-5 text-sm leading-relaxed text-sc-text-muted">
              <span className="mb-2 block font-display text-base font-semibold text-sc-text">Tráfico invisible</span>
              El flujo que entra y sale de cada equipo ocurre todo el día, pero la mayoría de los dashboards no muestran nada hasta después del incidente.
            </p>
            <p className="rounded-lg border sc-hairline bg-sc-bg/50 p-5 text-sm leading-relaxed text-sc-text-muted">
              <span className="mb-2 block font-display text-base font-semibold text-sc-text">Herramientas que piden demasiado</span>
              Muchos monitores quieren ver todo: paquetes completos, IPs, payloads. En la mayoría de los entornos eso es un consentimiento que nadie firmó.
            </p>
            <p className="rounded-lg border sc-hairline bg-sc-bg/50 p-5 text-sm leading-relaxed text-sc-text-muted">
              <span className="mb-2 block font-display text-base font-semibold text-sc-text">Alertas sin hechos</span>
              Un aviso que no explica por qué disparó te obliga a confiar en la herramienta. La evidencia debería ser el primer dato, no el opcional.
            </p>
          </div>
        </div>
      </section>

      {/* ===== SOLUCIÓN (features) ===== */}
      <section aria-labelledby="solucion" className="border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">La solución</p>
          <h2 id="solucion" className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl">
            Determinista primero. IA como ayuda, nunca como juez.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="rounded-lg border sc-hairline bg-sc-panel/60 p-6 transition-colors hover:border-sc-accent/30">
                <h3 className="font-display text-lg font-semibold tracking-tight text-sc-text">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA ===== */}
      <section aria-labelledby="como-funciona" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">Cómo funciona</p>
          <h2 id="como-funciona" className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl">
            Tres pasos, ninguna caja negra.
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="relative rounded-lg border sc-hairline bg-sc-bg/50 p-6">
                <span aria-hidden="true" className="font-mono text-3xl font-semibold text-sc-accent/70">{s.n}</span>
                <h3 className="mt-3 font-display text-lg font-semibold text-sc-text">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== ARQUITECTURA RESUMIDA ===== */}
      <section aria-labelledby="arquitectura" className="border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">Arquitectura resumida</p>
          <h2 id="arquitectura" className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl">
            Agente local → agregación → dashboard. Nada más.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-sc-text-muted">
            El motor determinista decide qué es anómalo con reglas explícitas; la IA solo recibe hechos ya agregados, una vez cada 5 minutos como máximo.
          </p>
          <div className="mt-10">
            <ArchitectureDiagram />
          </div>
        </div>
      </section>

      {/* ===== PRIVACIDAD ===== */}
      <section aria-labelledby="privacidad" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 id="privacidad" className="font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl">
              La nube recibe señales agregadas, no paquetes crudos.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-sc-text-muted">
              Con la anonimización activada, la dirección IP de tu red no sale del equipo. El dashboard muestra lo necesario para decidir: tendencias, picos y alertas con hechos.
            </p>
          </div>
        </div>
      </section>

      {/* ===== MENSAJE CLAVE + CTA FINAL ===== */}
      <section aria-labelledby="contacto-final">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="rounded-xl border sc-hairline bg-sc-panel/70 px-6 py-12 text-center sm:px-12">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">Mensaje clave</p>
            <p className="mx-auto mt-4 max-w-2xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl">
              Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/contacto"
                className="rounded-md bg-sc-accent px-6 py-3 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
              >
                Contactar
              </Link>
              <Link
                href="/security"
                className="rounded-md border sc-hairline px-6 py-3 text-sm font-semibold text-sc-text transition-colors hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
              >
                Ver postura de seguridad
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
