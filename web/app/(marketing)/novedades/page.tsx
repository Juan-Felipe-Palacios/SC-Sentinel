// SC-Sentinel — Novedades públicas de release.
// Fuente: docs/release/changelog.md; copy orientado a usuario/operador.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { RELEASES } from "@/lib/releases";
import { PRODUCT, PRODUCT_VERSION_LABEL } from "@/lib/product-facts";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Novedades",
  description:
    "Cambios públicos de SC-Sentinel: agente, colector NetFlow/IPFIX, servicio Windows, GUI, GeoLite2 Country/ASN y dashboard.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/novedades",
  },
  openGraph: {
    title: "SC-Sentinel — Novedades",
    description:
      "Qué cambió en cada release de SC-Sentinel, desde la base operativa 0.1.0 hasta la 0.1.8.",
    url: "https://sc-sentinel.vercel.app/novedades",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SC-Sentinel — novedades" }],
  },
};

const GROUP_LABELS: Array<[keyof (typeof RELEASES)[number]["groups"], string]> = [
  ["added", "Agregado"],
  ["changed", "Cambiado"],
  ["fixed", "Corregido"],
  ["security", "Seguridad"],
];

export default function Novedades() {
  return (
    <>
      <section className="sc-grid-bg border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            SC-Sentinel · Novedades
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-sc-text sm:text-5xl">
            Lo que cambió, release por release.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-sc-text-muted">
            El producto evoluciona sobre una misma regla: el motor determinista decide en el equipo y la nube
            recibe señales agregadas. Acá están los cambios públicos del agente, el dashboard y la operación.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-sc-accent/30 bg-sc-accent/10 px-3.5 py-1 font-mono text-xs text-sc-accent">
              <Sparkles className="h-3.5 w-3.5" />
              Versión actual {PRODUCT_VERSION_LABEL}
            </span>
            <span className="font-mono text-xs text-sc-text-muted">Última entrada: {PRODUCT.releaseLabel}</span>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/funcionalidades"
              className="rounded-md bg-sc-accent px-5 py-3 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
            >
              Ver funcionalidades
            </Link>
            <Link
              href="/contacto"
              className="rounded-md border sc-hairline bg-sc-panel/60 px-5 py-3 text-sm font-semibold text-sc-text transition-colors hover:border-sc-accent/40 hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
            >
              Consultar por el paquete
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="novedades-lista" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Historial público
          </p>
          <h2
            id="novedades-lista"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            De 0.1.0 a 0.1.8, sin promesas de roadmap.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-sc-text-muted">
            Solo se listan capacidades implementadas. El paquete de Windows y Linux se entrega desde el canal de
            release del proyecto; si necesitás acceso, escribinos.
          </p>

          <div className="mt-10 space-y-5">
            {RELEASES.map((release) => (
              <article
                key={release.version}
                className="rounded-lg border sc-hairline bg-sc-bg/50 p-6 sm:p-8"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl font-semibold tracking-tight text-sc-text">
                        {release.version}
                      </h3>
                      {release.version === PRODUCT.version ? (
                        <span className="rounded-full border border-sc-accent/30 bg-sc-accent/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-sc-accent">
                          Actual
                        </span>
                      ) : null}
                      <span className="font-mono text-xs text-sc-text-muted">{release.date}</span>
                    </div>
                    <p className="mt-2 font-display text-lg font-semibold text-sc-text">{release.title}</p>
                  </div>
                  <p className="max-w-xl text-sm leading-relaxed text-sc-text-muted">{release.summary}</p>
                </div>

                <div className="mt-5 flex items-start gap-2 rounded-md border border-sc-accent/20 bg-sc-accent/5 px-4 py-3 text-sm leading-relaxed text-sc-text-muted">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sc-accent" aria-hidden="true" />
                  <span>{release.highlight}</span>
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  {GROUP_LABELS.map(([key, label]) => {
                    const items = release.groups[key];
                    if (!items || items.length === 0) return null;
                    return (
                      <div key={key}>
                        <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-sc-accent">
                          {label}
                        </h4>
                        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-sc-text-muted">
                          {items.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                              <span aria-hidden="true" className="mt-0.5 font-mono text-sc-accent">
                                →
                              </span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="novedades-cta">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="rounded-xl border sc-hairline bg-sc-panel/70 px-6 py-12 text-center sm:px-12">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
              Siguiente paso
            </p>
            <h2
              id="novedades-cta"
              className="mx-auto mt-4 max-w-2xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
            >
              ¿Querés ver estas capacidades con tus propios datos?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-sc-text-muted">
              La demo pública es de solo lectura. Para instalar el agente o coordinar un despliegue, el canal es
              contacto.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-md bg-sc-accent px-6 py-3 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc]"
              >
                Abrir demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/contacto"
                className="rounded-md border sc-hairline px-6 py-3 text-sm font-semibold text-sc-text transition-colors hover:text-sc-accent"
              >
                Contactar
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
