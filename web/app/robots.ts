// SC-Sentinel — robots.txt (App Router metadata route).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/login"],
    },
    sitemap: "https://sc-sentinel.vercel.app/sitemap.xml",
    host: "https://sc-sentinel.vercel.app",
  };
}
