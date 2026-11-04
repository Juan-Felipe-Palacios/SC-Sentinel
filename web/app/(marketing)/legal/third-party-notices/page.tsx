// SC-Sentinel — Avisos de terceros (M3 Task 6, publicada con sign-off del equipo, nov 2026).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Avisos de terceros",
  description:
    "Componentes de terceros incorporados en SC-Sentinel (Sniffnet, MaxMind GeoLite2, crates y paquetes npm) con sus licencias y obligaciones.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/legal/third-party-notices",
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: "SC-Sentinel — Avisos de terceros",
    description:
      "SC-Sentinel es software propietario de Strategic Connex; incorpora componentes de terceros bajo sus propias licencias.",
    url: "https://sc-sentinel.vercel.app/legal/third-party-notices",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
  },
};

const scHeredado = [
  ["Sniffnet — sc-capture (networking/capture.rs, parse_packets.rs, manage_packets.rs)", "Base del módulo de captura (sc-capture)", "MIT / Apache-2.0 (doble)"],
  ["Sniffnet — networking/ipfix/* (collector NetFlow/IPFIX)", "Base del colector (sc-collector)", "MIT / Apache-2.0"],
  ["Sniffnet — mmdb/* (integraciones MaxMind)", "Base del módulo de geolocalización (sc-geo)", "MIT / Apache-2.0"],
];

const datos = [
  ["MaxMind GeoLite2 (Country / ASN, .mmdb)", "Geolocalización de hosts (sc-geo)", "CC BY-SA 4.0 + condiciones del EULA de MaxMind"],
];

const runtimeNpm = [
  ["Next.js 15.5.28", "MIT"],
  ["React 19 / React DOM 19", "MIT"],
  ["TypeScript 5.9", "Apache-2.0"],
  ["Tailwind CSS 4 (@tailwindcss/postcss)", "MIT"],
  ["@neondatabase/serverless", "MIT"],
  ["drizzle-orm", "Apache-2.0"],
  ["jose", "MIT"],
  ["lucide-react", "ISC"],
  ["recharts", "MIT"],
  ["swr", "MIT"],
  ["date-fns", "MIT"],
  ["zod", "MIT"],
];

const depsDev = [
  "ESLint 9 + eslint-config-next 15.5.28 + @eslint/eslintrc — MIT",
  "Vitest 5 — MIT",
  "drizzle-kit — MIT (verificar audit por release)",
  "@types/node, @types/react, @types/react-dom — MIT",
];

export default function ThirdPartyNotices() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
        Legal · Strategic Connex
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-sc-text sm:text-4xl">
        Avisos de terceros
      </h1>
      <p className="mt-3 text-sm text-sc-text-muted">Última actualización: noviembre de 2026.</p>
      <p className="mt-6 text-sm leading-relaxed text-sc-text-muted">
        SC-Sentinel es software propietario de <strong>Strategic Connex</strong> e incorpora componentes de terceros
        bajo sus propias licencias. Las obligaciones de cada uno se respetan listándolos aquí y conservando los
        avisos en el código fuente heredado.
      </p>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">1. Código fuente heredado (extracción dirigida)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm leading-relaxed text-sc-text-muted">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-sc-text-muted">
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Componente</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Uso</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Licencia</th>
              </tr>
            </thead>
            <tbody>
              {scHeredado.map(([comp, uso, lic]) => (
                <tr key={comp}>
                  <td className="border-b sc-hairline py-2 pr-4">{comp}</td>
                  <td className="border-b sc-hairline py-2 pr-4">{uso}</td>
                  <td className="border-b sc-hairline py-2">{lic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          Los archivos heredados conservan sus encabezados de licencia originales. Sniffnet © Gulian Vardanyan y
          colaboradores. La marca “Sniffnet” no se utiliza en superficies de usuario de SC-Sentinel.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">2. Bases de datos embebidas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm leading-relaxed text-sc-text-muted">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-sc-text-muted">
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Componente</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Uso</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Licencia / condición</th>
              </tr>
            </thead>
            <tbody>
              {datos.map(([comp, uso, lic]) => (
                <tr key={comp}>
                  <td className="border-b sc-hairline py-2 pr-4">{comp}</td>
                  <td className="border-b sc-hairline py-2 pr-4">{uso}</td>
                  <td className="border-b sc-hairline py-2">{lic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">3. Software del entorno (no redistribuido)</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li><strong>Npcap (Windows)</strong> — driver de captura de paquetes. Lo instala el usuario; SC-Sentinel no lo redistribuye.</li>
          <li><strong>libpcap (Linux)</strong> — driver de captura de paquetes. Licencia BSD-style, provista por el sistema operativo.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">4. Crates de Rust (agente)</h2>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          Licencias dominantes: <strong>MIT / Apache-2.0</strong> (ecosistema Rust). El inventario completo y auditado
          se regenera en cada release con <code>cargo deny check --license</code> y <code>cargo audit</code>. Los
          principales al momento de esta publicación: tokio, serde / serde_json, schemars, thiserror, anyhow, tracing,
          reqwest (rustls), rusqlite, backoff, config, clap, uuid / ulid, sha2, hmac, secrecy, flate2, zstd (opcional),
          insta (dev), proptest (dev), windows-service, pcap, etherparse.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">5. Web (npm)</h2>
        <p className="text-sm leading-relaxed text-sc-text-muted">
          Licencias dominantes: <strong>MIT / Apache-2.0</strong>. La fuente auditable de cada pre-release es
          <code> pnpm licenses list</code>; esta lista es la foto al publicar esta página (inventario real de
          <code> web/package.json </code>).
        </p>
        <h3 className="font-display text-base font-semibold text-sc-text">Runtime</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm leading-relaxed text-sc-text-muted">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-sc-text-muted">
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Paquete</th>
                <th className="border-b sc-hairline pb-2 font-mono font-medium">Licencia</th>
              </tr>
            </thead>
            <tbody>
              {runtimeNpm.map(([pkg, lic]) => (
                <tr key={pkg}>
                  <td className="border-b sc-hairline py-2 pr-4">{pkg}</td>
                  <td className="border-b sc-hairline py-2">{lic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="font-display text-base font-semibold text-sc-text">Desarrollo</h3>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          {depsDev.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">6. Obligaciones operativas</h2>
        <ol className="list-decimal space-y-1 pl-6 text-sm leading-relaxed text-sc-text-muted">
          <li>El inventario se regenera antes de cada release (checklist de <code>testing/release-checklist.md</code>).</li>
          <li>Esta página se actualiza junto con cada cambio de dependencias que incorpore nuevo componente o cambie licencia.</li>
          <li>Los encabezados de licencia de los archivos heredados nunca se eliminan; agregar un archivo nuevo implica agregar su aviso aquí.</li>
          <li>Los componentes no descritos en esta página requieren revisión previa al merge (cargo-deny y las licencias npm fallan en CI antes, normalmente).</li>
        </ol>
        <p className="mt-6 text-xs leading-relaxed text-sc-text-muted">
          Texto fuente: <code>docs/legal/THIRD_PARTY_NOTICES.md</code>. Preguntas: <Link className="text-sc-accent hover:text-[#7dd3fc]" href="/contacto">/contacto</Link>.
        </p>
      </section>
    </article>
  );
}
