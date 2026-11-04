// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import "./globals.css";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata = {
  title: "SC-Sentinel",
  description: "Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
