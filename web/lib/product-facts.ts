// SC-Sentinel — datos públicos del producto.
// Fuente: agent/Cargo.toml, web/package.json, docs/release/changelog.md.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export const PRODUCT = {
  name: "SC-Sentinel",
  company: "Strategic Connex",
  version: "0.1.7",
  releaseLabel: "15 nov 2026",
  windowSeconds: 30,
  swrSeconds: 5,
  platforms: ["Windows (servicio)", "Linux (colector)"],
  models: {
    primary: "gemini-3.6-flash",
    secondary: "gemini-3.5-flash",
    label: "Gemini 3.6 Flash",
    fallbacks: ["OpenRouter", "Groq"],
  },
  detectionRules: [
    "blacklist_hit",
    "port_scan",
    "inbound_port_scan",
    "dns_tunneling",
    "volume_anomaly",
    "capture_error",
    "capture_degraded",
    "packet_drops",
    "parse_errors",
  ],
  releaseNotesHref: "/novedades",
} as const;

export const PRODUCT_VERSION_LABEL = `v${PRODUCT.version}`;
