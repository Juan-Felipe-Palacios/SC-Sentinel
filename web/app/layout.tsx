// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import "./globals.css";

export const metadata = {
  title: "SC-Sentinel",
  description: "Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
