// SC-Sentinel — Home (placeholder M3 Task 1; la home completa llega en Task 2).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";

export const metadata = {
  title: "SC-Sentinel — Monitoreo de red con motor local",
  description:
    "SC-Sentinel analiza tu tráfico localmente con un motor determinista y publica solo señales agregadas a tu dashboard.",
};

export default function MarketingHome() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sc-accent">
        SC-Sentinel · Strategic Connex
      </p>
      <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-sc-text sm:text-5xl lg:text-6xl">
        Ve lo que pasa en tu red. Sin enviar paquetes crudos a la nube.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-sc-text-muted">
        SC-Sentinel analiza tu tráfico localmente con un motor determinista y publica solo señales agregadas a tu
        dashboard. Cuando algo raro sucede, te enteras con evidencia.
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
      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.18em] text-sc-text-muted">
        Señales agregadas · No paquetes crudos · Motor local
      </p>
    </section>
  );
}
