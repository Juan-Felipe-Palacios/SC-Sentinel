// SC-Sentinel — header público del grupo (marketing). Server component, sin JS de cliente.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import Logo from "./Logo";

const links = [
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/security", label: "Seguridad" },
  { href: "/demo", label: "Ver demo" },
  { href: "/contacto", label: "Contacto" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b sc-hairline bg-sc-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
          aria-label="SC-Sentinel — inicio"
        >
          <Logo size={30} />
          <span className="font-display text-lg font-semibold tracking-tight text-sc-text">
            SC-Sentinel
            <span className="mt-0.5 block font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-sc-text-muted">
              Strategic Connex
            </span>
          </span>
        </Link>

        <nav aria-label="Navegación principal" className="order-3 -mx-2 flex w-full items-center gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:overflow-visible sm:pb-0">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-sc-text-muted transition-colors hover:bg-sc-panel hover:text-sc-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contacto"
            className="ml-1 whitespace-nowrap rounded-md bg-sc-accent px-4 py-2 text-sm font-semibold text-sc-bg transition-colors hover:bg-[#7dd3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sc-accent"
          >
            Contactar
          </Link>
        </nav>
      </div>
    </header>
  );
}
