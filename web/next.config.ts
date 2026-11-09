import type { NextConfig } from "next";
import {
  buildGlobalSecurityHeaders,
  buildTrustPageHeaders,
} from "./lib/security/headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildGlobalSecurityHeaders(isDev),
      },
      {
        // El token de la Trust Page viaja en la URL: no debe filtrarse por
        // Referer ni quedar en cachés compartidas.
        source: "/p/:path*",
        headers: buildTrustPageHeaders(),
      },
    ];
  },
};

export default nextConfig;
