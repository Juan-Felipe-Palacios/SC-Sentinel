// SC-Sentinel — Seguridad (M3 Task 4, SSG, cero fetch en runtime).
// Fuente de copy: docs/ux/copywriting.md + plan M3 Task 4.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Seguridad | Postura verificable",
  description:
    "HMAC-SHA-256 para los identificadores, tokens de dispositivo con hash SHA-256, sesión firmada, secretos solo en el servidor, retención estricta con limpieza diaria y cero paquetes crudos en la nube.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/security",
  },
  openGraph: {
    title: "SC-Sentinel — Seguridad",
    description:
      "La seguridad empieza por la nuestra. Medidas activas, límites explícitos y transparencia total.",
    url: "https://sc-sentinel.vercel.app/security",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SC-Sentinel — seguridad" }],
  },
};

const medidas = [
  {
    kicker: "Anonimización",
    title: "HMAC-SHA-256, con la clave en tu equipo",
    body: "Los identificadores de host se reemplazan por claves derivadas con HMAC-SHA-256. La clave vive solo en el equipo y nunca viaja a la nube: la nube ve claves y conteos, no direcciones.",
  },
  {
    kicker: "Dispositivos",
    title: "Tokens de un solo uso, guardados como hash",
    body: "El token del agente se muestra una vez al darlo de alta y en la base de datos solo queda su hash SHA-256. Se puede rotar en cualquier momento, sin tocar el resto del panel.",
  },
  {
    kicker: "Sesiones",
    title: "Una sola cookie firmada protege el panel",
    body: "El dashboard vive detrás de una cookie httpOnly firmada (HS256). Sin sesión válida no hay lectura ni escritura del panel; no hay rutas alternativas.",
  },
  {
    kicker: "Infraestructura",
    title: "Secretos, solo del lado del servidor",
    body: "Las credenciales (OPENROUTER_API_KEY, CRON_SECRET, clave de sesión) viven en variables de entorno del servidor. El navegador nunca las recibe ni las conoce.",
  },
  {
    kicker: "Retención",
    title: "Limpieza diaria, política escrita",
    body: "Cada tabla tiene su política (7, 15 o 30 días según el dato) y un job diario a las 03:00 UTC la aplica. Ni datos de devices ni configuraciones se borran por limpieza.",
  },
  {
    kicker: "Observabilidad",
    title: "Logs sin paquetes ni secretos",
    body: "Los eventos estructurados registran tipo de operación, resultado y conteos. Nunca incluyen paquetes, payloads, secretos ni direcciones sin anonimizar.",
  },
];

const noHacemos = [
  {
    title: "No recibimos paquetes crudos",
    body: "Nunca viajan a la nube. Al panel llegan hechos agregados: conteos, claves hasheadas y alertas.",
  },
  {
    title: "No inspeccionamos payloads",
    body: "El agente calcula longitudes y metadatos de cabecera; el contenido de los paquetes nunca se lee ni se almacena.",
  },
  {
    title: "No vendemos ni compartimos tus datos",
    body: "Las métricas son tuyas. No hay terceros, corredores de datos ni publicidad construida sobre tu tráfico.",
  },
  {
    title: "La IA no decide",
    body: "La IA resume y sugiere. El motor determinista decide; si la IA no está disponible, el sistema sigue completo en su modo determinista.",
  },
];

export default function Security() {
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="sc-grid-bg border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            SC-Sentinel · Seguridad
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-sc-text sm:text-5xl">
            La seguridad empieza por la nuestra.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-sc-text-muted">
            Primero las medidas que protegen tu flujo entre la red y el panel. Después, los límites
            que nos ponemos nosotros mismos, por escrito. Nada de promesas absolutas: reglas
            verificables y un equipo que responde.
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
        </div>
      </section>

      {/* ===== MEDIDAS ACTIVAS ===== */}
      <section aria-labelledby="sec-medidas" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Medidas activas
          </p>
          <h2
            id="sec-medidas"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Lo que está activo hoy, sin letra chica voluntaria.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {medidas.map((m) => (
              <article
                key={m.title}
                className="rounded-lg border sc-hairline bg-sc-bg/50 p-6 transition-colors hover:border-sc-accent/30"
              >
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-sc-accent">
                  {m.kicker}
                </p>
                <h3 className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight text-sc-text">
                  {m.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{m.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-sc-text-muted">
            El spool local retiene los datos cuando la conexión cae y los envía al reconectar. Su
            confidencialidad depende de los permisos del sistema operativo del equipo donde corre
            el agente: en Windows, el servicio corre con su cuenta; en Linux, cuida el directorio
            de instalación como cualquier otro secreto.
          </p>
        </div>
      </section>

      {/* ===== LO QUE NO HACEMOS ===== */}
      <section aria-labelledby="sec-nolimites" className="border-b sc-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Límites explícitos
          </p>
          <h2
            id="sec-nolimites"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Lo que no hacemos, dicho por escrito.
          </h2>
          <ul className="mt-10 grid gap-4 md:grid-cols-2">
            {noHacemos.map((n) => (
              <li
                key={n.title}
                className="flex items-start gap-4 rounded-lg border sc-hairline bg-sc-bg/50 p-6"
              >
                <span
                  aria-hidden="true"
                  className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sc-risk-critical/40 font-mono text-xs text-sc-risk-critical"
                >
                  ×
                </span>
                <span>
                  <h3 className="font-display text-base font-semibold leading-snug text-sc-text">
                    {n.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">{n.body}</p>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== TRANSPARENCIA ===== */}
      <section aria-labelledby="sec-transparencia" className="border-b sc-hairline bg-sc-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
            Transparencia
          </p>
          <h2
            id="sec-transparencia"
            className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            Lo que incorporamos, lo publicamos.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border sc-hairline bg-sc-bg/50 p-6">
              <h3 className="font-display text-lg font-semibold tracking-tight text-sc-text">
                Avisos de terceros
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
                Los componentes incorporados (Sniffnet, MaxMind GeoLite2, crates y paquetes npm)
                se listan con licencia y obligación correspondiente.
              </p>
              <Link
                href="/legal/third-party-notices"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
              >
                Ver avisos de terceros →
              </Link>
              <p className="mt-2 text-xs text-sc-text-muted">En preparación: publicación tras revisión legal.</p>
            </article>
            <article className="rounded-lg border sc-hairline bg-sc-bg/50 p-6">
              <h3 className="font-display text-lg font-semibold tracking-tight text-sc-text">
                Política de privacidad
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sc-text-muted">
                Qué datos se recolectan, qué rol cumple la anonimización y cómo se aplica la
                retención, en lenguaje claro.
              </p>
              <Link
                href="/legal/privacy"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
              >
                Leer la política de privacidad →
              </Link>
              <p className="mt-2 text-xs text-sc-text-muted">En preparación: publicación tras revisión legal.</p>
            </article>
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-sc-text-muted">
            ¿Encontraste un problema de seguridad? Repórtalo a través de{" "}
            <Link
              href="/contacto"
              className="font-semibold text-sc-accent transition-colors hover:text-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
            >
              contacto
            </Link>
            . Respondemos en ≤ 1 día hábil y coordinamos la divulgación responsable.
          </p>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section aria-labelledby="sec-cta">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2
            id="sec-cta"
            className="mx-auto max-w-2xl font-display text-2xl font-semibold leading-snug tracking-tight text-sc-text sm:text-3xl"
          >
            ¿Preguntas técnicas sobre la postura?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-sc-text-muted">
            El equipo responde con los detalles que necesitas: alcance de la anonimización,
            políticas de retención y despliegue en tu entorno.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
              Ver funcionalidades
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
