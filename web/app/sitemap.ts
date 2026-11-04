// SC-Sentinel — sitemap.xml (App Router metadata route).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

const BASE_URL = "https://sc-sentinel.vercel.app";

export default function sitemap() {
  const now = new Date();
  const routes = [
    { url: `${BASE_URL}/`, priority: 1.0, changeFrequency: "weekly" as const },
    { url: `${BASE_URL}/funcionalidades`, priority: 0.8, changeFrequency: "monthly" as const },
    { url: `${BASE_URL}/security`, priority: 0.8, changeFrequency: "monthly" as const },
    { url: `${BASE_URL}/contacto`, priority: 0.6, changeFrequency: "monthly" as const },
    { url: `${BASE_URL}/legal/privacy`, priority: 0.4, changeFrequency: "yearly" as const },
    { url: `${BASE_URL}/legal/terms`, priority: 0.4, changeFrequency: "yearly" as const },
    { url: `${BASE_URL}/legal/third-party-notices`, priority: 0.4, changeFrequency: "yearly" as const },
  ];
  return routes.map((r) => ({ ...r, lastModified: now }));
}
