// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { countryDisplay } from '@/lib/format';

/**
 * Bandera SVG local (`flag-icons`).
 *
 * Los emoji de bandera (🇮🇱) no se renderizan como bandera en Windows: Chromium
 * muestra las letras del código ("IL"). Con SVGs propios el resultado es el
 * mismo en Windows, macOS y Linux, sin pedidos a un CDN externo.
 */
export function CountryFlag({
  country,
  className = '',
}: {
  country: string | null | undefined;
  className?: string;
}) {
  const code = country?.trim().toUpperCase();

  // LAN, sin geolocalizar o códigos no ISO: se mantiene el emoji/ícono actual.
  if (!code || !/^[A-Z]{2}$/.test(code)) {
    const { flag, label } = countryDisplay(country);
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        title={label}
        aria-hidden="true"
      >
        {flag}
      </span>
    );
  }

  const { label } = countryDisplay(code);
  // Inline: `.fi` fija width en em y ganaría a las utilidades de Tailwind.
  return (
    <span
      className={`fi fi-${code.toLowerCase()} shrink-0 rounded-[2px] ring-1 ring-white/15 ${className}`}
      style={{ width: 16, height: 12 }}
      title={label}
      aria-hidden="true"
    />
  );
}
