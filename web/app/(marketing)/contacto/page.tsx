// SC-Sentinel — Contacto (M3 Task 5, SSG con cliente de formulario).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import { ContactForm } from "@/components/marketing/ContactForm";
import { RATE_LIMIT_PER_HOUR } from "@/lib/contact/schema";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Contacto | Hablemos",
  description:
    "Soporte técnico y consultas comerciales de SC-Sentinel. Envía un mensaje con el formulario o escribe a contacto@strategicconnex.com.ar. Respondemos en ≤ 1 día hábil.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/contacto",
  },
  openGraph: {
    title: "SC-Sentinel — Contacto",
    description:
      "Soporte técnico y consultas comerciales. Respondemos en ≤ 1 día hábil.",
    url: "https://sc-sentinel.vercel.app/contacto",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/og/landing.png", width: 1200, height: 630, alt: "SC-Sentinel — contacto" }],
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
            Hablemos de tu red.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-sc-text-muted">
            Para soporte técnico inmediato, escribe a{" "}
            <a
              href="mailto:contacto@strategicconnex.com.ar"
              className="font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
            >
              contacto@strategicconnex.com.ar
            </a>
            . Para consultas comerciales y de despliegue, usa este formulario.
          </p>
        </div>
      </section>

      {/* ===== FORMULARIO + DATOS ===== */}
      <section aria-labelledby="con-form">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-5 lg:py-16">
          <div className="lg:col-span-3">
            <h2
              id="con-form"
              className="font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text"
            >
              Envía tu mensaje
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
              Máximo {RATE_LIMIT_PER_HOUR} mensajes por hora desde tu IP. El mensaje no se almacena
              en la base de datos: llega al buzón del equipo y respondemos en ≤ 1 día hábil.
            </p>
            <div className="mt-8">
              <ContactForm />
            </div>
          </div>

          <aside className="space-y-4 lg:col-span-2" aria-label="Datos de contacto">
            <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-6">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-sc-text-muted">
                Buzón directo
              </h3>
              <a
                href="mailto:contacto@strategicconnex.com.ar"
                className="mt-3 block font-display text-lg font-semibold tracking-tight text-sc-text transition-colors hover:text-sc-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
              >
                contacto@strategicconnex.com.ar
              </a>
              <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
                Consultas comerciales, soporte y reportes de seguridad. Los reportes de seguridad
                tienen divulgación coordinada: escribe por aquí y respondemos en ≤ 1 día hábil.
              </p>
            </div>

            <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-6">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-sc-text-muted">
                Respuesta
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
                Respondemos en ≤ 1 día hábil. Si necesitas una demo técnica, indica en el mensaje
                el tamaño de tu red y el tipo de tráfico que quieres monitorear.
              </p>
            </div>

            <div className="rounded-lg border sc-hairline bg-sc-panel/50 p-6">
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-sc-text-muted">
                Privacidad de tus datos
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
                Los datos enviados en este formulario se usan solo para responderte. Detalle en la{" "}
                <Link
                  href="/legal/privacy"
                  className="font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
                >
                  política de privacidad
                </Link>{" "}
                <span className="text-sc-text-muted">(en preparación: publicación tras revisión legal)</span>.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
