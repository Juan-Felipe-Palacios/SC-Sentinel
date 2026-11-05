// SC-Sentinel — DashboardPreview: mockup interactivo del dashboard (puro CSS/SVG, sin assets).
// Muestra cada card del dashboard con tabs para navegar entre vistas.
// Usado en la landing page (sección §18.1 "Dashboard en acción").
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
"use client";
import { useState } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type TabId = "overview" | "hosts" | "alerts" | "ai" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
  description: string;
}

// ─── Configuración de tabs ─────────────────────────────────────────────────────
const TABS: Tab[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "▦",
    description: "Estado global del agente, tráfico y alertas recientes.",
  },
  {
    id: "hosts",
    label: "Hosts",
    icon: "⬡",
    description: "Tabla de hosts con riesgo, país y bytes en tiempo real.",
  },
  {
    id: "alerts",
    label: "Alertas",
    icon: "◈",
    description: "Alertas con evidencia adjunta y lifecycle open → resolved.",
  },
  {
    id: "ai",
    label: "Panel IA",
    icon: "◎",
    description: "Análisis por lotes: tendencias, hallazgos y recomendaciones.",
  },
  {
    id: "settings",
    label: "Ajustes",
    icon: "⊛",
    description: "Token de dispositivo, anonimización y estado de sincronización.",
  },
];

// ─── Paleta (mirror de globals.css sin var() — necesaria fuera de Tailwind) ────
const C = {
  bg: "#0b1220",
  panel: "#0e162e",
  surface: "#111827",
  surfaceAlt: "#1f2937",
  border: "rgba(148,163,184,0.14)",
  text: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#38bdf8",
  ok: "#10b981",
  warn: "#f59e0b",
  degraded: "#8b5cf6",
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  chartIn: "#38bdf8",
  chartOut: "#a78bfa",
} as const;

// ─── Mock de mini línea de tráfico ─────────────────────────────────────────────
function SparkLine({
  color,
  points,
}: {
  color: string;
  points: number[];
}) {
  const h = 36;
  const w = 120;
  const max = Math.max(...points);
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((v) => h - (v / max) * (h - 4));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");
  return (
    <svg width={w} height={h} aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L ${w} ${h} L 0 ${h} Z`}
        fill={`url(#sg-${color.replace("#", "")})`}
      />
      <path d={d} stroke={color} strokeWidth="1.6" fill="none" />
    </svg>
  );
}

// ─── OVERVIEW ──────────────────────────────────────────────────────────────────
function OverviewMockup() {
  const inPoints = [12, 18, 15, 22, 19, 28, 25, 31, 24, 38, 29, 42, 35, 48, 40];
  const outPoints = [8, 11, 9, 13, 11, 16, 14, 18, 15, 22, 18, 26, 21, 30, 24];

  return (
    <div className="space-y-3">
      {/* Row 1 — stat cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Agente */}
        <div
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
          className="rounded-lg p-3"
        >
          <p style={{ color: C.muted, fontSize: 10 }} className="font-mono uppercase tracking-widest">
            Agente
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              style={{ background: C.ok }}
              className="inline-block h-2 w-2 rounded-full"
            />
            <span style={{ color: C.ok, fontSize: 13 }} className="font-semibold">
              online
            </span>
          </div>
          <p style={{ color: C.muted, fontSize: 10 }} className="mt-1 font-mono">
            v0.4.2 · hace 2 s
          </p>
        </div>

        {/* Hosts únicos */}
        <div
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
          className="rounded-lg p-3"
        >
          <p style={{ color: C.muted, fontSize: 10 }} className="font-mono uppercase tracking-widest">
            Hosts únicos
          </p>
          <p style={{ color: C.text, fontSize: 20 }} className="mt-1 font-semibold tabular-nums">
            142
          </p>
          <p style={{ color: C.muted, fontSize: 10 }} className="mt-0.5 font-mono">
            hashes · 24 h
          </p>
        </div>

        {/* Alertas */}
        <div
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
          className="rounded-lg p-3"
        >
          <p style={{ color: C.muted, fontSize: 10 }} className="font-mono uppercase tracking-widest">
            Alertas abiertas
          </p>
          <p style={{ color: C.warn, fontSize: 20 }} className="mt-1 font-semibold tabular-nums">
            3
          </p>
          <p style={{ color: C.muted, fontSize: 10 }} className="mt-0.5 font-mono">
            1 high · 2 medium
          </p>
        </div>
      </div>

      {/* Row 2 — traffic chart */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <p style={{ color: C.muted, fontSize: 10 }} className="font-mono uppercase tracking-widest">
            Tráfico — últimas 6 h
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1" style={{ color: C.chartIn, fontSize: 10 }}>
              <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: C.chartIn }} />
              in
            </span>
            <span className="flex items-center gap-1" style={{ color: C.chartOut, fontSize: 10 }}>
              <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: C.chartOut }} />
              out
            </span>
          </div>
        </div>
        <div className="relative flex gap-1">
          <SparkLine color={C.chartIn} points={inPoints} />
          <div className="absolute inset-0 flex" style={{ marginLeft: 4 }}>
            <SparkLine color={C.chartOut} points={outPoints} />
          </div>
        </div>
        <div className="mt-1 flex justify-between font-mono" style={{ color: C.muted, fontSize: 9 }}>
          <span>-6h</span>
          <span>-3h</span>
          <span>ahora</span>
        </div>
      </div>

      {/* Row 3 — top 5 hosts + alertas recientes */}
      <div className="grid grid-cols-2 gap-2">
        {/* Top 5 hosts */}
        <div
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
          className="rounded-lg p-3"
        >
          <p style={{ color: C.muted, fontSize: 10 }} className="mb-2 font-mono uppercase tracking-widest">
            Top 5 hosts
          </p>
          {[
            { host: "h_a3f8c1", country: "🇦🇷", bytes: "2.4 GB", risk: "low" },
            { host: "h_b92e44", country: "🇺🇸", bytes: "1.1 GB", risk: "medium" },
            { host: "h_d14c99", country: "🇩🇪", bytes: "890 MB", risk: "low" },
            { host: "h_e7a211", country: "🇧🇷", bytes: "640 MB", risk: "high" },
            { host: "h_f3310b", country: "🇷🇺", bytes: "380 MB", risk: "critical" },
          ].map((h) => (
            <div
              key={h.host}
              className="flex items-center justify-between py-0.5"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <span style={{ color: C.muted, fontSize: 10 }} className="font-mono">
                {h.country} {h.host}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color:
                    h.risk === "critical"
                      ? C.critical
                      : h.risk === "high"
                      ? C.high
                      : h.risk === "medium"
                      ? C.medium
                      : C.low,
                  background:
                    h.risk === "critical"
                      ? "rgba(239,68,68,0.12)"
                      : h.risk === "high"
                      ? "rgba(249,115,22,0.12)"
                      : h.risk === "medium"
                      ? "rgba(234,179,8,0.12)"
                      : "rgba(34,197,94,0.12)",
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
                className="font-mono font-semibold uppercase"
              >
                {h.risk}
              </span>
            </div>
          ))}
        </div>

        {/* Alertas recientes */}
        <div
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
          className="rounded-lg p-3"
        >
          <p style={{ color: C.muted, fontSize: 10 }} className="mb-2 font-mono uppercase tracking-widest">
            Alertas recientes
          </p>
          {[
            { sev: "high", msg: "Pico volumen h_e7a211" },
            { sev: "medium", msg: "DNS flood port 53" },
            { sev: "medium", msg: "Geo desconocido RU" },
          ].map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-1"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: a.sev === "high" ? C.high : C.medium,
                  background: a.sev === "high" ? "rgba(249,115,22,0.12)" : "rgba(234,179,8,0.12)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  flexShrink: 0,
                  marginTop: 1,
                }}
                className="font-mono font-semibold uppercase"
              >
                {a.sev}
              </span>
              <span style={{ color: C.muted, fontSize: 10 }} className="font-mono leading-tight">
                {a.msg}
              </span>
            </div>
          ))}
          {/* AI status */}
          <div
            className="mt-2 flex items-center justify-between pt-2"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <span style={{ color: C.muted, fontSize: 10 }} className="font-mono">
              Estado IA
            </span>
            <span
              className="flex items-center gap-1 font-mono font-semibold"
              style={{ color: C.ok, fontSize: 10 }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.ok }} />
              ok · hace 4 min
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HOSTS ────────────────────────────────────────────────────────────────────
function HostsMockup() {
  const hosts = [
    { host: "h_a3f8c1", country: "🇦🇷 AR", bIn: "2.4 GB", bOut: "890 MB", pkts: "1.2 M", risk: "low", last: "2 s" },
    { host: "h_b92e44", country: "🇺🇸 US", bIn: "1.1 GB", bOut: "340 MB", pkts: "620 K", risk: "medium", last: "5 s" },
    { host: "h_d14c99", country: "🇩🇪 DE", bIn: "890 MB", bOut: "210 MB", pkts: "480 K", risk: "low", last: "12 s" },
    { host: "h_e7a211", country: "🇧🇷 BR", bIn: "640 MB", bOut: "180 MB", pkts: "290 K", risk: "high", last: "18 s" },
    { host: "h_f3310b", country: "🇷🇺 RU", bIn: "380 MB", bOut: "90 MB", pkts: "140 K", risk: "critical", last: "31 s" },
    { host: "h_c5520e", country: "🇨🇳 CN", bIn: "210 MB", bOut: "55 MB", pkts: "88 K", risk: "medium", last: "1 m" },
  ];

  const riskColor = (r: string) =>
    r === "critical" ? C.critical : r === "high" ? C.high : r === "medium" ? C.medium : C.low;
  const riskBg = (r: string) =>
    r === "critical"
      ? "rgba(239,68,68,0.12)"
      : r === "high"
      ? "rgba(249,115,22,0.12)"
      : r === "medium"
      ? "rgba(234,179,8,0.12)"
      : "rgba(34,197,94,0.12)";

  return (
    <div>
      {/* Barra de búsqueda */}
      <div className="mb-3 flex items-center gap-2">
        <div
          style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, flex: 1 }}
          className="flex items-center gap-2 rounded-md px-3 py-1.5"
        >
          <span style={{ color: C.muted, fontSize: 11 }}>🔍</span>
          <span style={{ color: C.muted, fontSize: 11 }} className="font-mono">
            Filtrar por host, IP o país...
          </span>
        </div>
        <div
          style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}
          className="rounded-md px-3 py-1.5"
        >
          <span style={{ color: C.muted, fontSize: 11 }} className="font-mono">
            Riesgo ▾
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="overflow-hidden rounded-lg"
      >
        {/* Cabecera */}
        <div
          className="grid gap-1 px-3 py-2 font-mono"
          style={{
            gridTemplateColumns: "1.8fr 0.8fr 1fr 1fr 0.8fr 0.65fr 0.5fr",
            borderBottom: `1px solid ${C.border}`,
            color: C.muted,
            fontSize: 9,
          }}
        >
          <span className="uppercase tracking-widest">Host</span>
          <span className="uppercase tracking-widest">País</span>
          <span className="uppercase tracking-widest">Bytes in</span>
          <span className="uppercase tracking-widest">Bytes out</span>
          <span className="uppercase tracking-widest">Paquetes</span>
          <span className="uppercase tracking-widest">Riesgo</span>
          <span className="uppercase tracking-widest">Último</span>
        </div>

        {hosts.map((h, i) => (
          <div
            key={h.host}
            className="grid gap-1 px-3 py-2 transition-colors"
            style={{
              gridTemplateColumns: "1.8fr 0.8fr 1fr 1fr 0.8fr 0.65fr 0.5fr",
              borderTop: i > 0 ? `1px solid ${C.border}` : undefined,
              fontSize: 10,
              color: C.text,
            }}
          >
            <span className="font-mono" style={{ color: C.accent }}>
              {h.host}
            </span>
            <span className="font-mono" style={{ color: C.muted }}>
              {h.country}
            </span>
            <span className="font-mono tabular-nums">{h.bIn}</span>
            <span className="font-mono tabular-nums">{h.bOut}</span>
            <span className="font-mono tabular-nums" style={{ color: C.muted }}>
              {h.pkts}
            </span>
            <span>
              <span
                style={{
                  fontSize: 8,
                  color: riskColor(h.risk),
                  background: riskBg(h.risk),
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {h.risk}
              </span>
            </span>
            <span className="font-mono" style={{ color: C.muted }}>
              {h.last}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ALERTS ───────────────────────────────────────────────────────────────────
function AlertsMockup() {
  const alerts = [
    {
      date: "14:38:12",
      sev: "high",
      rule: "vol_threshold",
      title: "Pico de volumen en h_e7a211",
      status: "open",
      ev: "bytes_in=640MB en 30s, umbral=200MB, host=h_e7a211",
    },
    {
      date: "14:22:05",
      sev: "medium",
      rule: "dns_flood",
      title: "Flood DNS desde port 53",
      status: "acknowledged",
      ev: "queries=4800/min, umbral=1000/min, proto=UDP",
    },
    {
      date: "13:51:40",
      sev: "medium",
      rule: "geo_unknown",
      title: "País desconocido RU detectado",
      status: "open",
      ev: "country=RU, host=h_f3310b, bytes_out=90MB",
    },
    {
      date: "12:18:33",
      sev: "low",
      rule: "port_scan",
      title: "Escaneo port 22 detectado",
      status: "resolved",
      ev: "ports_scanned=48, host=h_b92e44, duration=12s",
    },
  ];

  const sevColor = (s: string) =>
    s === "high" ? C.high : s === "medium" ? C.medium : s === "low" ? C.low : C.critical;
  const sevBg = (s: string) =>
    s === "high"
      ? "rgba(249,115,22,0.12)"
      : s === "medium"
      ? "rgba(234,179,8,0.12)"
      : s === "low"
      ? "rgba(34,197,94,0.12)"
      : "rgba(239,68,68,0.12)";
  const statusColor = (s: string) =>
    s === "resolved" ? C.ok : s === "acknowledged" ? C.degraded : C.warn;

  return (
    <div className="space-y-2">
      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {["Todos", "open", "acknowledged", "resolved"].map((f) => (
          <span
            key={f}
            style={{
              background: f === "Todos" ? C.accent : C.surfaceAlt,
              color: f === "Todos" ? C.bg : C.muted,
              fontSize: 9,
              borderRadius: 4,
              padding: "2px 8px",
              border: `1px solid ${f === "Todos" ? C.accent : C.border}`,
              fontFamily: "var(--font-mono)",
            }}
          >
            {f}
          </span>
        ))}
        <div className="flex-1" />
        <span
          style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, fontSize: 9, borderRadius: 4, padding: "2px 8px", color: C.muted, fontFamily: "var(--font-mono)" }}
        >
          Severidad ▾
        </span>
      </div>

      {/* Alertas */}
      {alerts.map((a, i) => (
        <div
          key={i}
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
          className="rounded-lg p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                style={{ fontSize: 9, color: sevColor(a.sev), background: sevBg(a.sev), padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase" }}
              >
                {a.sev}
              </span>
              <span style={{ color: C.text, fontSize: 11 }} className="font-semibold">
                {a.title}
              </span>
            </div>
            <span
              style={{ fontSize: 9, color: statusColor(a.status), background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", flexShrink: 0 }}
            >
              {a.status}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span style={{ color: C.muted, fontSize: 9 }} className="font-mono">
              {a.date}
            </span>
            <span style={{ color: C.muted, fontSize: 9 }} className="font-mono">
              regla: {a.rule}
            </span>
          </div>
          {/* Evidencia */}
          <div
            className="mt-2 rounded-md px-2 py-1.5 font-mono"
            style={{ background: C.bg, border: `1px solid ${C.border}`, fontSize: 9, color: C.muted }}
          >
            <span style={{ color: C.accent }}>evidence: </span>
            {a.ev}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AI PANEL ─────────────────────────────────────────────────────────────────
function AiMockup() {
  return (
    <div className="space-y-3">
      {/* Meta del análisis */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: C.ok }}
            />
            <span style={{ color: C.ok, fontSize: 10 }} className="font-mono font-semibold uppercase">
              IA activa
            </span>
          </div>
          <span
            style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, fontSize: 9, color: C.degraded, padding: "2px 7px", borderRadius: 4, fontFamily: "var(--font-mono)" }}
          >
            gemini-2.0-flash
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span style={{ color: C.muted, fontSize: 9 }} className="font-mono">Último análisis</span>
            <p style={{ color: C.text, fontSize: 11 }} className="mt-0.5 font-semibold">hace 4 min · 14:34:00</p>
          </div>
          <div>
            <span style={{ color: C.muted, fontSize: 9 }} className="font-mono">Período del lote</span>
            <p style={{ color: C.text, fontSize: 11 }} className="mt-0.5 font-semibold">08:00 → 14:34</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-3"
      >
        <p style={{ color: C.muted, fontSize: 10 }} className="mb-1.5 font-mono uppercase tracking-widest">
          Resumen
        </p>
        <p style={{ color: C.text, fontSize: 11, lineHeight: 1.55 }}>
          El tráfico de salida hacia RU aumentó un 340% respecto al período anterior. El host{" "}
          <span style={{ color: C.accent }} className="font-mono">h_e7a211</span> muestra patrones
          consistentes con exfiltración por volumen. Se detectaron 3 anomalías activas; 1 resuelta.
        </p>
        <div
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "4px 8px", marginTop: 8 }}
          className="flex items-center gap-1.5"
        >
          <span style={{ color: C.critical, fontSize: 10 }} className="font-mono font-semibold">
            risk_level:
          </span>
          <span style={{ color: C.critical, fontSize: 10 }} className="font-mono">
            HIGH
          </span>
        </div>
      </div>

      {/* Hallazgos */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-3"
      >
        <p style={{ color: C.muted, fontSize: 10 }} className="mb-2 font-mono uppercase tracking-widest">
          Hallazgos
        </p>
        {[
          "Pico de bytes out hacia AS en RU (3.4× promedio semanal)",
          "DNS flood persistente en port 53 durante 18 minutos",
          "Host h_e7a211 con volumen in anómalo en ventana de 30 s",
        ].map((f, i) => (
          <div
            key={i}
            className="flex items-start gap-2 py-1.5"
            style={{ borderTop: i > 0 ? `1px solid ${C.border}` : undefined }}
          >
            <span style={{ color: C.warn, fontSize: 10, flexShrink: 0 }}>⚠</span>
            <span style={{ color: C.text, fontSize: 10, lineHeight: 1.4 }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Recomendaciones */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-3"
      >
        <p style={{ color: C.muted, fontSize: 10 }} className="mb-2 font-mono uppercase tracking-widest">
          Recomendaciones
        </p>
        {[
          "Revisar y bloquear tráfico saliente hacia ASN detectado en RU",
          "Verificar reglas del firewall para port 53 UDP",
          "Marcar h_e7a211 como watchlist y auditar procesos locales",
        ].map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-2 py-1.5"
            style={{ borderTop: i > 0 ? `1px solid ${C.border}` : undefined }}
          >
            <span style={{ color: C.ok, fontSize: 10, flexShrink: 0 }}>→</span>
            <span style={{ color: C.text, fontSize: 10, lineHeight: 1.4 }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsMockup() {
  return (
    <div className="space-y-3">
      {/* Device token */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p style={{ color: C.text, fontSize: 12 }} className="font-semibold">Token de dispositivo</p>
            <p style={{ color: C.muted, fontSize: 10 }} className="mt-0.5 font-mono">Autenticación del agente local</p>
          </div>
          <span
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: C.ok, fontSize: 9, padding: "2px 7px", borderRadius: 4, fontFamily: "var(--font-mono)" }}
          >
            activo
          </span>
        </div>
        <div
          style={{ background: C.bg, border: `1px solid ${C.border}` }}
          className="flex items-center gap-2 rounded-md px-3 py-2"
        >
          <span style={{ color: C.muted, fontSize: 11 }} className="flex-1 font-mono">
            sc_tok_••••••••••••••••••••••••••••••••
          </span>
          <span style={{ color: C.accent, fontSize: 10 }} className="cursor-pointer font-mono">
            mostrar
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <span
            style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, fontSize: 10, color: C.muted, padding: "3px 10px", borderRadius: 5, fontFamily: "var(--font-mono)", cursor: "pointer" }}
          >
            Rotar token
          </span>
          <span
            style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, fontSize: 10, color: C.muted, padding: "3px 10px", borderRadius: 5, fontFamily: "var(--font-mono)", cursor: "pointer" }}
          >
            Copiar
          </span>
        </div>
      </div>

      {/* Anonimización */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p style={{ color: C.text, fontSize: 12 }} className="font-semibold">Anonimizar hosts</p>
            <p style={{ color: C.muted, fontSize: 10 }} className="mt-0.5">
              La nube solo ve hashes. IPs nunca salen del equipo.
            </p>
          </div>
          <div
            style={{ background: C.ok, width: 36, height: 20, borderRadius: 10, position: "relative" }}
          >
            <div
              style={{ position: "absolute", right: 3, top: 3, width: 14, height: 14, borderRadius: 7, background: "white" }}
            />
          </div>
        </div>
      </div>

      {/* Estado de sync */}
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        className="rounded-lg p-4"
      >
        <p style={{ color: C.muted, fontSize: 10 }} className="mb-2 font-mono uppercase tracking-widest">
          Estado de sincronización
        </p>
        {[
          { label: "Estado actual", val: "idle", color: C.ok },
          { label: "Último éxito", val: "14:38:14 · hace 2 s", color: C.muted },
          { label: "Snapshots en spool", val: "0 (vacío)", color: C.muted },
          { label: "Retención configurada", val: "30 días (política v1)", color: C.muted },
        ].map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-1.5"
            style={{ borderTop: i > 0 ? `1px solid ${C.border}` : undefined }}
          >
            <span style={{ color: C.muted, fontSize: 10 }} className="font-mono">{r.label}</span>
            <span style={{ color: r.color, fontSize: 10 }} className="font-mono font-semibold">{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function DashboardPreview() {
  const [active, setActive] = useState<TabId>("overview");
  const tab = TABS.find((t) => t.id === active)!;

  const renderContent = () => {
    switch (active) {
      case "overview":  return <OverviewMockup />;
      case "hosts":     return <HostsMockup />;
      case "alerts":    return <AlertsMockup />;
      case "ai":        return <AiMockup />;
      case "settings":  return <SettingsMockup />;
    }
  };

  return (
    <div
      aria-label="Vista previa del dashboard SC-Sentinel"
      style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14 }}
      className="overflow-hidden shadow-[0_0_80px_rgba(56,189,248,0.07)]"
    >
      {/* Barra de título del "navegador" */}
      <div
        style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}
        className="flex items-center justify-between px-4 py-2.5"
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.critical }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.warn }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.ok }} />
        </div>
        <div
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}
          className="flex items-center gap-2 px-3 py-1"
        >
          <span style={{ color: C.ok, fontSize: 9 }}>🔒</span>
          <span style={{ color: C.muted, fontSize: 10 }} className="font-mono">
            sc-sentinel.vercel.app/dashboard
          </span>
        </div>
        <span style={{ color: C.muted, fontSize: 10 }} className="font-mono">
          admin
        </span>
      </div>

      {/* Shell del dashboard: sidebar + contenido */}
      <div className="flex" style={{ minHeight: 480 }}>
        {/* Sidebar */}
        <div
          style={{ background: C.surface, borderRight: `1px solid ${C.border}`, width: 120, flexShrink: 0 }}
          className="flex flex-col py-3"
        >
          {/* Logo en sidebar */}
          <div className="mb-4 flex items-center gap-2 px-3">
            <span style={{ color: C.accent, fontSize: 14 }}>◈</span>
            <span style={{ color: C.text, fontSize: 11 }} className="font-semibold">
              SC-Sentinel
            </span>
          </div>

          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                background: active === t.id ? C.surfaceAlt : "transparent",
                borderLeft: active === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
                color: active === t.id ? C.text : C.muted,
                fontSize: 11,
                textAlign: "left",
                padding: "7px 10px 7px 12px",
                display: "flex",
                alignItems: "center",
                gap: 7,
                width: "100%",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 13 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}

          {/* Rango temporal */}
          <div className="mt-auto px-3 pb-1">
            <span
              style={{
                background: C.surfaceAlt,
                border: `1px solid ${C.border}`,
                color: C.muted,
                fontSize: 9,
                padding: "3px 6px",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                display: "block",
                textAlign: "center",
              }}
            >
              6 h ▾
            </span>
          </div>
        </div>

        {/* Área de contenido */}
        <div className="flex-1 overflow-auto p-4">
          {/* Header de vista */}
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h3 style={{ color: C.text, fontSize: 14 }} className="font-semibold">
                {tab.icon} {tab.label}
              </h3>
              <p style={{ color: C.muted, fontSize: 10 }} className="mt-0.5">
                {tab.description}
              </p>
            </div>
            <span style={{ color: C.muted, fontSize: 9 }} className="font-mono">
              Refresco SWR · 5 s
            </span>
          </div>

          {renderContent()}
        </div>
      </div>
    </div>
  );
}

