// SC-Sentinel — Términos de uso (M3 Task 6, publicada con sign-off del equipo, nov 2026).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Términos de uso",
  description:
    "Términos de uso del sitio y del software SC-Sentinel: identificación del servicio, licencia, uso aceptable, estado del servicio y jurisdicción.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/legal/terms",
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: "SC-Sentinel — Términos de uso",
    description:
      "Condiciones de uso del sitio sc-sentinel.vercel.app y del software SC-Sentinel (v1, ámbito interno).",
    url: "https://sc-sentinel.vercel.app/legal/terms",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
  },
};

export default function Terms() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
        Legal · Strategic Connex
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-sc-text sm:text-4xl">
        Términos de uso
      </h1>
      <p className="mt-3 text-sm text-sc-text-muted">Última actualización: noviembre de 2026.</p>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">1. Identificación del servicio</h2>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          Strategic Connex Anomaly Shield (<strong>SC-Sentinel</strong>) es software de monitoreo de red desarrollado y
          operado por <strong>Strategic Connex</strong>. La v1 es de uso interno del propietario: la landing pública es
          informativa y el dashboard requiere autenticación propia.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">2. Licencia de uso del software</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>El software es <strong>propietario</strong> de Strategic Connex. No se otorgan licencias de redistribución en la v1.</li>
          <li>La compilación e instalación del agente están limitadas a los equipos del operador autorizado.</li>
          <li>Los componentes de terceros se rigen por sus licencias propias (ver <Link className="text-sc-accent hover:text-[#7dd3fc]" href="/legal/third-party-notices">/legal/third-party-notices</Link>).</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">3. Uso aceptable</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>Prohibido: intentar acceso no autorizado al dashboard o a la API; automatizar el scraping del sitio público; inyectar tráfico sintético a <code>/api/ingest</code> sin token válido (aplican el rate limit y las medidas técnicas); usar el sistema para monitorear redes de terceros sin autorización de sus dueños.</li>
          <li>El operador del agente es responsable de cumplir la normativa local aplicable al monitoreo de sus propias redes y de notificar a los usuarios de los equipos monitoreados.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">4. Estado del servicio</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>El software (v1) se provee <strong>“tal cual”</strong>, sin garantías de inerrabilidad, exactitud de geolocalización o continuidad del análisis de IA (función con degradación elegida por diseño).</li>
          <li>El motor determinista local es la fuente de verdad de las alertas; el análisis de IA es asistencial y no reemplaza el criterio del operador.</li>
          <li>Strategic Connex no se responsabiliza por decisiones tomadas a partir de métricas o análisis del producto en la v1.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">5. Privacidad y limitación de responsabilidad</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>Los datos procesados son agregados por diseño (ver <Link className="text-sc-accent hover:text-[#7dd3fc]" href="/legal/privacy">/legal/privacy</Link>).</li>
          <li>En la máxima extensión permitida por la ley aplicable, Strategic Connex no responde por daños indirectos, lucro cesante o pérdida de datos derivados del uso del servicio.</li>
          <li>La única pérdida de datos esperada y documentada del sistema es la FIFO del spool local (500 MB / 7 días), siempre reportada en la salud del agente.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">6. Cambios</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>Estos términos pueden actualizarse; la versión vigente se publica en esta ruta con fecha de última actualización.</li>
          <li>Los cambios de mayor alcance funcional se comunican en las notas de release (CHANGELOG).</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">7. Contacto y jurisdicción</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>Contacto: perfil de LinkedIn del responsable (ver <Link className="text-sc-accent hover:text-[#7dd3fc]" href="/contacto">/contacto</Link>).</li>
          <li>Ley aplicable y jurisdicción: República Argentina. El foro es la Ciudad Autónoma de Buenos Aires, en la medida en que la normativa aplicable lo permita.</li>
        </ul>
      </section>
    </article>
  );
}
