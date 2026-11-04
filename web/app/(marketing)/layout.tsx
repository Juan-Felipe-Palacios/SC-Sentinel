// SC-Sentinel — layout del grupo (marketing): público, SSG, sin cookies ni datos dinámicos.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import SiteHeader from "@/components/marketing/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sc-grid-bg flex min-h-screen flex-col bg-sc-bg text-sc-text">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-sc-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-sc-bg"
      >
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
