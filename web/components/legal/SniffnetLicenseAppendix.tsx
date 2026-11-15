// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Anexo A: textos completos de las licencias del código original de Sniffnet.
import { SNIFFNET_COMMIT, SNIFFNET_LICENSE_APACHE, SNIFFNET_LICENSE_MIT } from '@/lib/legal/sniffnet-licenses';

export function SniffnetLicenseAppendix() {
  return (
    <section className="mt-12 space-y-4">
      <h2 className="font-display text-xl font-semibold tracking-tight text-sc-text">Anexo A — Licencias de Sniffnet v1.5.1</h2>
      <p className="text-sm leading-relaxed text-sc-text-muted">
        Textos completos conservados desde el tag <code>v1.5.1</code> (commit <code>{SNIFFNET_COMMIT}</code>),
        Copyright (c) 2022 Giuliano Bellini y colaboradores. Se incluyen sin modificaciones.
      </p>
      <div className="space-y-2">
        <h3 className="font-display text-base font-semibold text-sc-text">MIT License</h3>
        <pre className="max-h-[28rem] overflow-auto rounded-lg border sc-hairline bg-sc-surface p-4 font-mono text-[11px] leading-5 text-sc-text-muted whitespace-pre-wrap">{SNIFFNET_LICENSE_MIT}</pre>
      </div>
      <div className="space-y-2">
        <h3 className="font-display text-base font-semibold text-sc-text">Apache License 2.0</h3>
        <pre className="max-h-[28rem] overflow-auto rounded-lg border sc-hairline bg-sc-surface p-4 font-mono text-[11px] leading-5 text-sc-text-muted whitespace-pre-wrap">{SNIFFNET_LICENSE_APACHE}</pre>
      </div>
    </section>
  );
}
