// SC-Sentinel — OpenGraph image (1200×630), generada y firmada como asset propio.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SC-Sentinel — Ve lo que pasa en tu red, sin enviar paquetes crudos";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b1220",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* rejilla técnica */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(56,189,248,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.10) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -140,
            right: -140,
            width: 480,
            height: 480,
            background: "radial-gradient(circle, rgba(56,189,248,0.28) 0%, rgba(56,189,248,0) 70%)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: "monospace",
            fontSize: 26,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#38bdf8",
          }}
        >
          SC-Sentinel · Strategic Connex
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 24,
            fontSize: 64,
            fontWeight: 600,
            lineHeight: 1.14,
            letterSpacing: "-0.02em",
            color: "#e5e7eb",
            maxWidth: 940,
          }}
        >
          <div>Ve lo que pasa en tu red.</div>
          <div style={{ color: "#38bdf8" }}>Sin enviar paquetes crudos a la nube.</div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontFamily: "monospace",
            fontSize: 19,
            color: "#94a3b8",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Señales agregadas · No paquetes crudos · Motor local
        </div>
      </div>
    ),
    { ...size },
  );
}
