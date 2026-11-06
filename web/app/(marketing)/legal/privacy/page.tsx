// SC-Sentinel — Política de privacidad (M3 Task 6, publicada con sign-off del equipo, nov 2026).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Política de privacidad",
  description:
    "Qué datos procesa SC-Sentinel, qué no se recoge, cómo se aplica la anonimización y la retención, y qué terceros intervienen.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/legal/privacy",
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: "SC-Sentinel — Política de privacidad",
    description:
      "El sistema procesa señales agregadas por diseño: sin paquetes crudos, sin contenido de tráfico, sin venta de datos.",
    url: "https://sc-sentinel.vercel.app/legal/privacy",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
  },
};

const retention = [
  ["Ventanas/snapshots (flow_windows)", "7 días"],
  ["Estadísticas por host (host_stats)", "7 días"],
  ["Alertas", "30 días"],
  ["Salud del agente (agent_health)", "7 días"],
  ["Insights de IA", "15 días"],
  ["Registro de batches (idempotencia)", "2 días"],
];

const terceros = [
  ["Vercel", "Hosting y ejecución de la aplicación", "HTTP cifrado (HTTPS); aplica su DPA estándar."],
  ["Neon", "Base de datos Postgres gestionada", "Almacenamiento de señales agregadas; aplica el DPA de Neon."],
  ["OpenRouter", "Procesamiento temporal para el análisis IA", "Solo recibe hechos agregados normalizados (sin PII cruda)."],
  ["MaxMind (GeoLite2)", "Geolocalización off-line", "La base .mmdb se consulta en el nodo local; no hay consultas online."],
];

export default function Privacy() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
        Legal · Strategic Connex
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-sc-text sm:text-4xl">
        Política de privacidad
      </h1>
      <p className="mt-3 text-sm text-sc-text-muted">Última actualización: noviembre de 2026.</p>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">1. Qué datos recoge el sistema</h2>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          SC-Sentinel está diseñado para procesar señales agregadas de tráfico de red. El sistema distingue dos orígenes:
        </p>
        <h3 className="font-display text-base font-semibold text-sc-text">Del nodo local (agente)</h3>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>Señales agregadas por ventana de 30 segundos: conteos de bytes y paquetes, puertos y protocolos dominantes, cantidad de hosts distintos y países, y alertas generadas por reglas locales.</li>
          <li>Métricas de salud del agente: paquetes vistos y descartados, errores de parseo, profundidad de cola, uso de CPU/memoria y estado del spool local.</li>
        </ul>
        <h3 className="font-display text-base font-semibold text-sc-text">Identificadores</h3>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>IP del destino y clave de host hasheada (`host_key`, HMAC truncada). Por defecto el panel muestra IP y nombre de host para que el operador identifique el destino; el nombre se resuelve por DNS inverso en el servidor.</li>
          <li>Si se activa <code>anonymize_hosts=true</code> en la configuración del agente, la IP real <strong>no sale del equipo</strong>: el campo `ip_display` se envía `null` y el panel muestra solo la clave hasheada (contrato <code>ingest-api.v1.md</code>).</li>
          <li>Identificadores técnicos del dispositivo (<code>device_id</code>, hostname del nodo, versión del agente) para administrar el enrollment.</li>
        </ul>
        <h3 className="font-display text-base font-semibold text-sc-text">Del sitio público</h3>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          La landing no recaba datos personales: no hay formularios ni campos que recojan información del
          visitante. El contacto se realiza por el perfil de LinkedIn del responsable (ver{" "}
          <Link className="text-sc-accent hover:text-[#7dd3fc]" href="/contacto">/contacto</Link>), una plataforma
          de un tercero: lo que se escriba allí queda en LinkedIn bajo su propia política y no se copia a
          nuestros sistemas.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">2. Qué no recoge</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>Paquetes crudos ni contenido de tráfico: nunca se envían ni se guardan.</li>
          <li>Flujos individuales: solo agregación por ventanas.</li>
          <li>IPs reales de la LAN cuando está activa la anonimización.</li>
          <li>Credenciales en claro: el token del agente se guarda como hash SHA-256; el texto en claro se muestra una única vez al crearlo o rotarlo.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">3. Retención</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm leading-relaxed text-sc-text-muted">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-sc-text-muted">
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Dato</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Retención</th>
              </tr>
            </thead>
            <tbody>
              {retention.map(([dato, plazo]) => (
                <tr key={dato}>
                  <td className="border-b sc-hairline py-2 pr-4">{dato}</td>
                  <td className="border-b sc-hairline py-2">{plazo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          La purga es automática, todos los días a las 03:00 UTC. Si el spool local del agente supera su cota
          (500 MB / 7 días), se descartan primero los datos más antiguos (FIFO) y la pérdida queda reflejada
          en la salud del agente: nunca es una pérdida silenciosa.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">4. Terceros que intervienen</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm leading-relaxed text-sc-text-muted">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-sc-text-muted">
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Tercero</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Rol</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {terceros.map(([tercero, rol, nota]) => (
                <tr key={tercero}>
                  <td className="border-b sc-hairline py-2 pr-4">{tercero}</td>
                  <td className="border-b sc-hairline py-2 pr-4">{rol}</td>
                  <td className="border-b sc-hairline py-2">{nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          Ley aplicable: Ley 25.326 de Protección de Datos Personales (Argentina). El sitio no publica formularios
          de recolección; la consulta enviada por LinkedIn queda alcanzada por ese marco en lo que respecta al
          responsable del tratamiento.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">5. Seguridad</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>Autenticación: token de agente rotable + cookie de administración firmada (HS256, httpOnly).</li>
          <li>Transporte: HTTPS only; payload comprimido (gzip) con límite de 128 KB.</li>
          <li>Los logs no incluyen tokens completos, encabezado Authorization ni payloads crudos.</li>
          <li>Anonimización integrada <code>anonymize_hosts</code> (HMAC truncada) — ver también <Link className="text-sc-accent hover:text-[#7dd3fc]" href="/security">/security</Link>.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">6. Derechos y contacto</h2>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          El responsable del tratamiento es <strong>Strategic Connex</strong>. Los titulares de los datos procesados
          por el sistema pueden solicitar acceso, actualización o supresión escribiendo por{" "}
          <Link className="text-sc-accent hover:text-[#7dd3fc]" href="/contacto">/contacto</Link> (perfil de
          LinkedIn del responsable).
        </p>
        <p className="mt-6 text-xs leading-relaxed text-sc-text-muted">
          SC-Sentinel es software propietario de Strategic Connex. Esta política puede actualizarse; la versión
          vigente es la publicada en esta ruta.
        </p>
      </section>
    </article>
  );
}
