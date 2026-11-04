// SC-Sentinel — footer público del grupo (marketing).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import Logo from "./Logo";

const producto = [
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/security", label: "Seguridad" },
  { href: "/contacto", label: "Contacto" },
];

const legal = [
  { href: "/legal/privacy", label: "Privacidad" },
  { href: "/legal/terms", label: "Términos" },
  { href: "/legal/third-party-notices", label: "Avisos de terceros" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t sc-hairline bg-sc-panel/60">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Logo size={26} />
              <span className="font-display font-semibold text-sc-text">SC-Sentinel</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-sc-text-muted">
              Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos.
            </p>
          </div>

          <nav aria-label="Producto">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sc-text-muted">Producto</h2>
            <ul className="mt-3 space-y-2">
              {producto.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-sc-text-muted transition-colors hover:text-sc-text">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sc-text-muted">Legal</h2>
            <ul className="mt-3 space-y-2">
              {legal.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-sc-text-muted transition-colors hover:text-sc-text">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t sc-hairline pt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-sc-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Strategic Connex</span>
          <span>sc-sentinel.vercel.app</span>
        </div>
      </div>
    </footer>
  );
}
