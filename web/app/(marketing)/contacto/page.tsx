// SC-Sentinel — Contacto (M3 Task 5). Canal único: perfil de LinkedIn del responsable.
// LinkedIn no ofrece API pública para enviar mensajes a perfiles personales, así que no hay formulario.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const LINKEDIN_URL = "https://www.linkedin.com/in/juanfpalacios";
const LINKEDIN_HANDLE = "www.linkedin.com/in/juanfpalacios";

// Glifo de marca inline: lucide-react 1.x no distribuye iconos de marcas.
function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.37V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.26 2.37 4.26 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.75v20.5C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.75V1.75C24 .78 23.2 0 22.22 0z" />
    </svg>
  );
}

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Contacto | Hablemos por LinkedIn",
  description:
    "Canal de contacto de SC-Sentinel: mensaje directo al perfil de LinkedIn de Juan F. Palacios (Strategic Connex). Sin formularios ni correos automáticos.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/contacto",
  },
  openGraph: {
    title: "SC-Sentinel — Contacto",
    description:
      "Soporte técnico, consultas comerciales y reportes de seguridad por LinkedIn. Respondemos en ≤ 1 día hábil.",
    url: "https://sc-sentinel.vercel.app/contacto",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SC-Sentinel — contacto" }],
  },
};

export default function Contacto() {
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="sc-grid-bg border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            SC-Sentinel · Contacto
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-sc-text sm:text-5xl">
            Hablemos por LinkedIn.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-sc-text-muted">
            Todo el contacto —soporte técnico, consultas comerciales y reportes de seguridad— pasa por
            un único canal: el perfil de LinkedIn del responsable del producto. LinkedIn no permite
            que un sitio web envíe mensajes directos a un perfil personal, así que no hay formulario:
            el mensaje se escribe directamente en LinkedIn.
          </p>
        </div>
      </section>

      {/* ===== PERFIL ===== */}
      <section aria-labelledby="con-perfil">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-5 lg:py-16">
          <div className="lg:col-span-3">
            <h2
              id="con-perfil"
              className="font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text"
            >
              Perfil de contacto
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
              Abre el perfil y usa «Mensaje» para escribir. Si no tienes sesión iniciada, LinkedIn te
              pedirá ingresar o crear una cuenta antes de mostrar el botón.
            </p>

            <div className="mt-8 rounded-lg border sc-hairline bg-sc-panel/50 p-6 sm:p-8">
              <div className="flex flex-wrap items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-12 shrink-0 items-center justify-center rounded-md border border-sc-viz-in/40 bg-sc-viz-in/10 text-sc-viz-in"
                >
                  <LinkedInGlyph className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-xl font-semibold tracking-tight text-sc-text">
                    Juan F. Palacios
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-sc-text-muted">
                    Strategic Connex · SC-Sentinel
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-sc-text-muted">
                    {LINKEDIN_HANDLE}
                  </p>
                </div>
              </div>

              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex items-center gap-2 rounded-md border border-sc-viz-in/40 bg-sc-viz-in/10 px-5 py-3 font-display text-[15px] font-semibold text-sc-viz-in transition-all hover:bg-sc-viz-in/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50"
              >
                <LinkedInGlyph className="size-4" />
                Abrir perfil en LinkedIn
                <ArrowUpRight className="size-4" aria-hidden="true" />
                <span className="sr-only">(se abre en una pestaña nueva)</span>
              </a>

              <p className="mt-4 text-xs leading-relaxed text-sc-text-muted">
                Enlace directo:{" "}
                <a
                  href={LINKEDIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  {LINKEDIN_HANDLE}
                </a>
              </p>
            </div>
          </div>

          <aside className="space-y-4 lg:col-span-2" aria-label="Datos de contacto">
            <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-6">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-sc-text-muted">
                Qué incluir en el mensaje
              </h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-sc-text-muted">
                <li>Tamaño aproximado de la red y tipo de tráfico a monitorear.</li>
                <li>Entorno de despliegue (on-premise, VPC, cloud) y volumen diario.</li>
                <li>Motivo: soporte, demo técnica, despliegue o reporte de seguridad.</li>
              </ul>
            </div>

            <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-6">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-sc-text-muted">
                Respuesta
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-sc-text-muted">
                Respondemos en ≤ 1 día hábil. Los reportes de seguridad siguen divulgación
                coordinada: indica el impacto observado y un medio para contactarte.
              </p>
            </div>

            <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-6">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-sc-text-muted">
                Privacidad de la conversación
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-sc-text-muted">
                Este sitio no recaba datos personales: no hay formularios ni correos automáticos. Lo
                que escribas queda en LinkedIn, bajo su propia política, y no se copia a nuestros
                sistemas. Detalle en la{" "}
                <Link
                  href="/legal/privacy"
                  className="font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  política de privacidad
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
