// SC-Sentinel — Funcionalidades (M3 Task 3, SSG, cero fetch en runtime).
// Fuente de copy: docs/ux/copywriting.md + spec §18.1 (docs/ux/landing-sitemap.md).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import ArchitectureDiagram from "@/components/marketing/ArchitectureDiagram";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Funcionalidades | Motor determinista local",
  description:
    "Motor determinista local (etherparse, reglas y baseline), agregación en ventanas de 30 s, anonimización HMAC y IA por lotes con degraded. Paquetes crudos, nunca.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/funcionalidades",
  },
  openGraph: {
    title: "SC-Sentinel — Funcionalidades",
    description:
      "Motor determinista primero. Agregación que envía solo señales. IA como ayuda, nunca como juez.",
    url: "https://sc-sentinel.vercel.app/funcionalidades",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SC-Sentinel — funcionalidades" }],
  },
};

const deepDives = [
  {
    n: "01",
    kicker: "Motor determinista local",
    title: "La fuente de verdad es el agente Rust, no la nube.",
    body: "El agente parsea el tráfico capa por capa con etherparse y evalúa reglas explícitas: servicios conocidos, geolocalización por país, listas negras y umbrales. Cada alerta puede explicar exactamente por qué disparó, con los datos que la respaldan.",
    bullets: [
      "Parsing L2/L3/L4 con etherparse (0.20)",
      "Miles de servicios reconocidos y geo por país",
      "Listas negras y umbrales configurables",
      "Baseline por dispositivo para detectar desviaciones",
      "Reproducible: mismas entradas, misma decisión, siempre explicable",
    ],
  },
  {
    n: "02",
    kicker: "Agregación inteligente",
    title: "Ventanas de 30 segundos. Señales, nunca paquetes.",
    body: "El motor resume qué hosts, puertos y países dominan el tráfico en ventanas cortas. A la nube viajan contadores y hashes: top hosts, picos y alertas. Los paquetes crudos y los flujos individuales nunca salen del equipo.",
    bullets: [
      "Ventanas de 30 s con top hosts, puertos y países",
      "Umbrales y picos detectados por el motor local",
      "Solo conteos y hashes son enviados",
      "Spool local: si la conexión cae, los datos esperan",
    ],
  },
  {
    n: "03",
    kicker: "Privacidad por diseño",
    title: "Zero Raw Data to Cloud, no como eslogan: como contrato.",
    body: "Con la anonimización activada, los identificadores de host e IP se reemplazan por claves derivadas con HMAC. La clave nunca sale del equipo; la nube recibe hashes y conteos que no puede revertir ni correlacionar con tu infraestructura real.",
    bullets: [
      "anonymize_hosts: HMAC-SHA-256 sobre cada identificador",
      "La clave de derivación vive solo en tu equipo",
      "La nube ve claves y volúmenes, nunca direcciones",
      "Sin paquetes crudos, sin flujos individuales, sin payloads",
    ],
  },
  {
    n: "04",
    kicker: "IA complementaria",
    title: "Enriquecimiento por lotes. Nunca el motor de decisiones.",
    body: "La IA analiza tendencias sobre hechos ya agregados, una vez cada 15 minutos como máximo. Sugiere pasos y resume patrones; no bloquea, no decide y no ve paquetes crudos. Si el servicio no está disponible, el sistema degrada elegantemente: el motor determinista sigue activo y las alertas continúan funcionando.",
    bullets: [
      "Hasta 1 análisis de IA cada 15 minutos",
      "Entrada: hechos agregados del motor, nunca paquetes",
      "Modo degraded: sin IA, las reglas y alertas siguen",
      "La IA enriquece; el motor determinista decide",
    ],
  },
  {
    n: "05",
    kicker: "Colector pasivo NetFlow / IPFIX",
    title: "También observa lo que no pasa por tu PC.",
    body: "El agente incluye un colector pasivo para NetFlow v5/v9 e IPFIX: recibe flujos exportados por routers y switches, los normaliza y los agrega en las mismas ventanas deterministas. Las métricas del colector quedan visibles en el dashboard para vigilar pérdida y plantillas.",
    bullets: [
      "NetFlow v5, v9 e IPFIX soportados",
      "Normalización a las mismas ventanas de 30 s",
      "Métricas de paquetes recibidos, descartados y parse errors",
      "Plantillas cacheadas y flujos normalizados visibles en agent_health",
    ],
  },
  {
    n: "06",
    kicker: "Chatbot con RAG",
    title: "Consultá el estado de tu red en lenguaje natural.",
    body: "Un asistente con RAG responde sobre tus datos agregados con streaming SSE e historial. Solo accede a señales agregadas y hashes anonimizados; nunca a paquetes crudos. Funciona para administradores y visitantes de la demo en modo solo lectura.",
    bullets: [
      "Streaming SSE con respuestas progresivas",
      "Historial de conversación persistido",
      "Contexto solo sobre señales agregadas",
      "Degradación elegante si el servicio no está disponible",
    ],
  },
  {
    n: "07",
    kicker: "Exports y Trust Pages",
    title: "Datos auditables y compartibles con control.",
    body: "Exportá datasets en CSV o XLSX con streaming y auditoría de quién descargó qué. Las Trust Pages permiten compartir resúmenes públicos por token, con rotación, revocación y registro de accesos.",
    bullets: [
      "Export CSV/XLSX con streaming para datasets grandes",
      "Auditoría de descargas por usuario y período",
      "Trust Pages por token con expiración",
      "Rotación, revocación y log de accesos",
    ],
  },
  {
    n: "08",
    kicker: "Evals y salud del agente",
    title: "Observabilidad del sistema que te protege.",
    body: "El dashboard incluye métricas de AI Evals (coste, latencia y tasa de éxito por modelo) y la salud del agente local (captura, spool, cola y métricas del colector). Así podés verificar que el motor y la IA funcionan como esperás.",
    bullets: [
      "Coste, latencia p50/p95 y tasa de éxito por modelo",
      "Estado de captura, spool y cola del agente",
      "Métricas del colector NetFlow/IPFIX",
      "Limpieza programada de datos por retención",
    ],
  },
];

const cards = [
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

export default function Funcionalidades() {
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="sc-grid-bg border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            SC-Sentinel · Funcionalidades
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-sc-text sm:text-5xl">
            El motor determinista primero. La IA, después.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-sc-text-muted">
            Esto es lo que hace SC-Sentinel, cómo lo hace y qué nunca hace. Motor local con reglas explícitas, agregación
            en ventanas de 30 segundos, anonimización por diseño e IA como enriquecimiento por lotes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/contacto"
              className="rounded-md bg-sc-accent px-5 py-3 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
            >
              Contactar
            </Link>
            <Link
              href="/security"
              className="rounded-md border sc-hairline bg-sc-panel/60 px-5 py-3 text-sm font-semibold text-sc-text transition-colors hover:border-sc-accent/40 hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
            >
              Ver postura de seguridad
            </Link>
          </div>
        </div>
      </section>

      {/* ===== DIFERENCIADORES EN PROFUNDIDAD ===== */}
      {deepDives.map((d) => (
        <section
          key={d.n}
          aria-labelledby={`fn-${d.n}`}
          className="border-b sc-hairline odd:bg-sc-panel/40"
        >
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-12 md:py-16">
            <div className="md:col-span-5">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
                {d.n} · {d.kicker}
              </p>
              <h2
                id={`fn-${d.n}`}
                className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
              >
                {d.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-sc-text-muted">{d.body}</p>
            </div>
            <ul className="flex flex-col justify-center gap-3 md:col-span-7">
              {d.bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 rounded-lg border sc-hairline bg-sc-bg/50 px-4 py-3 text-sm leading-relaxed text-sc-text-muted"
                >
                  <span aria-hidden="true" className="mt-0.5 font-mono text-sc-accent">
                    →
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {/* ===== PIPELINE EXTENDIDO ===== */}
      <section aria-labelledby="fn-pipeline" className="border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">Cómo viajan los datos</p>
          <h2
            id="fn-pipeline"
            className="mx-auto mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Equipo local → motor determinista → señales → dashboard. Nada más.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-sc-text-muted">
            El tráfico se observa y se interpreta donde vive. La nube nunca ve el tráfico; solo ve lo que el motor
            decide compartir: hechos agregados.
          </p>
          <div className="mt-10">
            <ArchitectureDiagram />
          </div>
        </div>
      </section>

      {/* ===== LO ESENCIAL (cards del copy) ===== */}
      <section aria-labelledby="fn-esencial" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">Lo esencial</p>
          <h2
            id="fn-esencial"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Seis capacidades, una sola regla.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((f) => (
              <article
                key={f.title}
                className="rounded-lg border sc-hairline bg-sc-bg/50 p-6 transition-colors hover:border-sc-accent/30"
              >
                <h3 className="font-display text-lg font-semibold tracking-tight text-sc-text">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section aria-labelledby="fn-cta">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="rounded-xl border sc-hairline bg-sc-panel/70 px-6 py-12 text-center sm:px-12">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">Mensaje clave</p>
            <h2
              id="fn-cta"
              className="mx-auto mt-4 max-w-2xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
            >
              Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos.
            </h2>
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
