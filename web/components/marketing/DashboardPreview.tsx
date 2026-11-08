// SC-Sentinel — DashboardPreview: Mockup de alta fidelidad interactivo del dashboard
// Estilo Enterprise SOC / Dark Cyberpunk sobrio (Raycast + Cloudflare + Vercel)
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Server,
  Activity,
  Cpu,
  Sliders,
  ExternalLink,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Terminal,
  Zap,
  RefreshCw,
  Search,
} from "lucide-react";

type TabId = "overview" | "hosts" | "alerts" | "ai" | "settings";

interface TabMeta {
  id: TabId;
  label: string;
  badge?: string;
  icon: typeof Server;
  desc: string;
}

const TABS: TabMeta[] = [
  { id: "overview", label: "Overview", icon: Activity, desc: "Telemetría global, estado del agente y throughput en tiempo real" },
  { id: "hosts", label: "Hosts Monitoreados", badge: "142", icon: Server, desc: "Inventario de endpoints analizados con scoring de riesgo" },
  { id: "alerts", label: "Alertas y Anomalías", badge: "3", icon: ShieldAlert, desc: "Detecciones heurísticas con evidencia criptográfica adjunta" },
  { id: "ai", label: "Copiloto IA RAG", badge: "Gemini 2.0", icon: Cpu, desc: "Síntesis cognitiva, razonamiento contextual y mitigaciones" },
  { id: "settings", label: "Ajustes & Token", icon: Sliders, desc: "Gobernanza de secretos, anonimización hash y políticas de sync" },
];

export default function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="relative rounded-2xl border border-slate-800/90 bg-[#090f1d]/95 shadow-[0_20px_90px_rgba(2,6,23,0.9),0_0_50px_rgba(56,189,248,0.07)] backdrop-blur-2xl overflow-hidden">
      {/* Barra superior de la ventana interactiva */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-4 py-3 gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="h-3 w-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          </div>
          <span className="font-mono text-xs text-slate-500 hidden sm:inline">|</span>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1 font-mono text-xs text-slate-300">
            <Lock className="h-3 w-3 text-emerald-400" />
            <span className="text-slate-400">https://</span>sc-sentinel.vercel.app/dashboard
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            MOTOR LOCAL ONLINE
          </span>
          <button
            onClick={handleRefresh}
            title="Simular refresco SWR"
            className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/70 px-2.5 py-1 font-mono text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-sky-400" : ""}`} />
            <span className="hidden md:inline">5s SWR</span>
          </button>
          <Link
            href="/demo"
            className="inline-flex items-center gap-1 rounded-md bg-sky-500 px-3 py-1 font-mono text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
          >
            Abrir Demo <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Grid del Dashboard: Sidebar de navegación + Viewport de contenido */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
        {/* Sidebar interactivo */}
        <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-950/50 p-3 sm:p-4 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">
              Vistas Principales
            </div>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 font-display text-sm font-medium transition-all text-left ${
                    isActive
                      ? "bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-[0_0_20px_rgba(56,189,248,0.15)]"
                      : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-sky-400" : "text-slate-500"}`} />
                    <span className="truncate">{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                        isActive
                          ? "bg-sky-400/20 text-sky-300"
                          : "bg-slate-800/80 text-slate-400"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Widget de estado del agente en sidebar */}
          <div className="mt-4 pt-4 border-t border-slate-850/80 rounded-xl bg-slate-900/40 p-3 border border-slate-800/60">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-sky-400" />
                <span>sc-agent daemon</span>
              </span>
              <span className="text-emerald-400 font-semibold">OK</span>
            </div>
            <div className="space-y-1 font-mono text-[11px] text-slate-500">
              <div className="flex justify-between">
                <span>Versión:</span>
                <span className="text-slate-300">v0.4.2 (Rust)</span>
              </div>
              <div className="flex justify-between">
                <span>Modo:</span>
                <span className="text-slate-300">PCAP Promiscuo</span>
              </div>
              <div className="flex justify-between">
                <span>Buffer Spool:</span>
                <span className="text-emerald-400 font-medium">0 queued (Sync)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Viewport Principal */}
        <div className="lg:col-span-9 p-4 sm:p-6 bg-slate-950/30 overflow-y-auto">
          {/* Header de la vista activa */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/60">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs text-sky-400 uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                Módulo en ejecución
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-100 mt-1">
                {activeTabMeta.label}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                {activeTabMeta.desc}
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400">
              <span className="text-slate-500">Rango:</span>
              <span className="text-slate-200 font-medium">Últimas 24h</span>
            </div>
          </div>

          {/* VISTAS DINÁMICAS */}

          {/* 1. OVERVIEW VIEW */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* KPIs Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Throughput In</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-xl sm:text-2xl font-bold text-sky-400">4.82 GB</span>
                    <span className="font-mono text-[11px] text-emerald-400 flex items-center">
                      <TrendingUp className="h-3 w-3 mr-0.5" /> +12%
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">1.24 M paquetes/h</span>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Throughput Out</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-xl sm:text-2xl font-bold text-purple-400">1.45 GB</span>
                    <span className="font-mono text-[11px] text-slate-400">nominal</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">TLS 1.3 predominante</span>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-amber-400">Anomalías Activas</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-xl sm:text-2xl font-bold text-amber-400">3</span>
                    <span className="font-mono text-[11px] text-amber-300">1 Crítica</span>
                  </div>
                  <span className="font-mono text-[10px] text-amber-400/70">Evidencia capturada</span>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">Privacidad</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-xl sm:text-2xl font-bold text-emerald-400">100%</span>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-400/80">0 raw packets enviados</span>
                </div>
              </div>

              {/* Gráfico de flujo de tráfico en vivo (SVG Vectorial dinámico) */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-sky-400" />
                    <span className="font-display text-sm font-semibold text-slate-200">
                      Dinámica de Tráfico Temporal (Bytes In vs Bytes Out)
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    <span className="flex items-center gap-1.5 text-sky-400">
                      <span className="h-2 w-2 rounded-full bg-sky-400" /> Bytes In
                    </span>
                    <span className="flex items-center gap-1.5 text-purple-400">
                      <span className="h-2 w-2 rounded-full bg-purple-400" /> Bytes Out
                    </span>
                  </div>
                </div>

                <div className="h-44 w-full relative">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 160">
                    <defs>
                      <linearGradient id="chartInGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="chartOutGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c084fc" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#c084fc" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Grilla horizontal */}
                    <line x1="0" y1="40" x2="600" y2="40" stroke="#1e293b" strokeDasharray="4 4" />
                    <line x1="0" y1="80" x2="600" y2="80" stroke="#1e293b" strokeDasharray="4 4" />
                    <line x1="0" y1="120" x2="600" y2="120" stroke="#1e293b" strokeDasharray="4 4" />

                    {/* Área y línea In */}
                    <path
                      d="M 0 130 Q 80 50, 160 90 T 320 40 T 480 85 T 600 30 L 600 160 L 0 160 Z"
                      fill="url(#chartInGrad)"
                    />
                    <path
                      d="M 0 130 Q 80 50, 160 90 T 320 40 T 480 85 T 600 30"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                    />

                    {/* Área y línea Out */}
                    <path
                      d="M 0 145 Q 90 110, 180 120 T 360 85 T 490 100 T 600 70 L 600 160 L 0 160 Z"
                      fill="url(#chartOutGrad)"
                    />
                    <path
                      d="M 0 145 Q 90 110, 180 120 T 360 85 T 490 100 T 600 70"
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="2"
                    />

                    {/* Punto de pico de alerta */}
                    <circle cx="320" cy="40" r="5" fill="#f59e0b" className="animate-ping" />
                    <circle cx="320" cy="40" r="4" fill="#f59e0b" />
                  </svg>
                </div>
                <div className="flex justify-between font-mono text-[10px] text-slate-500 mt-2">
                  <span>-24h (00:00)</span>
                  <span>-18h (06:00)</span>
                  <span>-12h (12:00) [Pico de Tráfico Detectado]</span>
                  <span>-6h (18:00)</span>
                  <span className="text-sky-400 font-semibold">Ahora (Live)</span>
                </div>
              </div>

              {/* Top Hosts & Alertas Snapshot */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-display text-sm font-semibold text-slate-200">
                      Top Endpoints de Mayor Consumo
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">Hash SHA-256</span>
                  </div>
                  <div className="space-y-2 font-mono text-xs">
                    {[
                      { hash: "h_8f4b219e... [Local Gateway]", country: "🇦🇷 AR", in: "1.82 GB", risk: "low" },
                      { hash: "h_3c17a90f... [Cloud API]", country: "🇺🇸 US", in: "940 MB", risk: "low" },
                      { hash: "h_d892e441... [DNS Resolver]", country: "🇧🇷 BR", in: "620 MB", risk: "medium" },
                      { hash: "h_e1194ac2... [Unknown ASN]", country: "🇷🇺 RU", in: "480 MB", risk: "critical" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-850">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{item.country}</span>
                          <span className="text-slate-200">{item.hash}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sky-400 font-semibold">{item.in}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              item.risk === "critical"
                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                : item.risk === "medium"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            }`}
                          >
                            {item.risk}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-display text-sm font-semibold text-slate-200">
                      Feed de Alertas Recientes
                    </span>
                    <span className="font-mono text-[11px] text-amber-400">3 no resueltas</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { title: "Exfiltración de Ancho de Banda", host: "h_e1194ac2", time: "hace 3 min", sev: "critical" },
                      { title: "Ráfaga de Consultas DNS Anómala", host: "h_d892e441", time: "hace 18 min", sev: "medium" },
                      { title: "Escaneo de Puertos TCP Inusual", host: "h_3c17a90f", time: "hace 42 min", sev: "low" },
                    ].map((alert, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                alert.sev === "critical" ? "bg-red-500 animate-pulse" : alert.sev === "medium" ? "bg-amber-500" : "bg-sky-400"
                              }`}
                            />
                            <span className="font-display text-xs font-semibold text-slate-200">{alert.title}</span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                            Target: <span className="text-sky-300">{alert.host}</span> · {alert.time}
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">Regla M1-04</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. HOSTS VIEW */}
          {activeTab === "hosts" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 flex-1 max-w-sm bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    readOnly
                    value="Filtrar por hash, país o riesgo..."
                    className="bg-transparent text-slate-300 focus:outline-none w-full"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>Modo Privacidad:</span>
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    HASH ACTIVO
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden font-mono text-xs">
                <div className="grid grid-cols-12 bg-slate-950/80 p-3 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                  <div className="col-span-5">Host / Endpoint Key</div>
                  <div className="col-span-2">Geolocalización</div>
                  <div className="col-span-2">Tráfico In/Out</div>
                  <div className="col-span-2">Riesgo Calculado</div>
                  <div className="col-span-1 text-right">Detalle</div>
                </div>

                <div className="divide-y divide-slate-850">
                  {[
                    { key: "h_e1194ac27b99...", country: "🇷🇺 Rusia (RU)", in: "480 MB", out: "1.2 GB", risk: "CRITICAL", color: "text-red-400" },
                    { key: "h_d892e441aa21...", country: "🇧🇷 Brasil (BR)", in: "620 MB", out: "140 MB", risk: "HIGH", color: "text-orange-400" },
                    { key: "h_3c17a90f110c...", country: "🇺🇸 USA (US)", in: "940 MB", out: "89 MB", risk: "MEDIUM", color: "text-amber-400" },
                    { key: "h_8f4b219e5512...", country: "🇦🇷 Argentina (AR)", in: "1.82 GB", out: "420 MB", risk: "LOW", color: "text-emerald-400" },
                    { key: "h_09aa311b78ee...", country: "🇩🇪 Alemania (DE)", in: "210 MB", out: "34 MB", risk: "LOW", color: "text-emerald-400" },
                  ].map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 p-3 items-center hover:bg-slate-850/50 transition-colors">
                      <div className="col-span-5 flex items-center gap-2">
                        <Server className="h-3.5 w-3.5 text-sky-400" />
                        <span className="text-slate-200 font-semibold">{row.key}</span>
                      </div>
                      <div className="col-span-2 text-slate-300">{row.country}</div>
                      <div className="col-span-2 text-slate-300">
                        {row.in} <span className="text-slate-500">/</span> {row.out}
                      </div>
                      <div className={`col-span-2 font-bold ${row.color}`}>{row.risk}</div>
                      <div className="col-span-1 text-right text-sky-400 cursor-pointer hover:underline">Ver →</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. ALERTS VIEW */}
          {activeTab === "alerts" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-red-500/20 text-red-300 px-2 py-0.5 font-mono text-[10px] font-bold uppercase border border-red-500/30">
                          CRITICAL · REGLA #VOL-EXFIL
                        </span>
                        <span className="font-mono text-xs text-slate-400">Disparado hace 3 minutos</span>
                      </div>
                      <h4 className="font-display text-base font-bold text-slate-100 mt-1">
                        Pico anómalo de transferencia de salida hacia ASN no clasificado
                      </h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        El endpoint <code className="bg-slate-900 px-1 py-0.5 rounded text-sky-300 font-mono">h_e1194ac27b99</code> transmitió 1.2 GB en ráfagas de 30 segundos continuas hacia destinos externos sin registro DNS inverso conocido.
                      </p>
                    </div>
                  </div>
                  <button className="shrink-0 rounded-lg bg-red-500 px-3 py-1.5 font-display text-xs font-semibold text-white hover:bg-red-400 transition-colors">
                    Marcar Mitigado
                  </button>
                </div>

                <div className="mt-3 rounded-lg bg-slate-950/80 p-3 border border-red-500/20 font-mono text-xs text-slate-300">
                  <div className="text-slate-400 mb-1 font-semibold flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-sky-400" />
                    Evidencia criptográfica e inmutable capturada:
                  </div>
                  <pre className="text-[11px] text-sky-300 overflow-x-auto whitespace-pre">
{`{
  "rule_id": "rule_exfil_high_vol",
  "snapshot_window": "2026-11-08T17:02:30Z",
  "bytes_out_spike": 1288490188,
  "threshold_limit": 209715200,
  "flow_entropy": 0.892,
  "signature_sha256": "9f833bc4e92e01bbf847291a..."
}`}
                  </pre>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 font-mono text-[10px] font-bold uppercase border border-amber-500/30">
                          MEDIUM · REGLA #DNS-FLOOD
                        </span>
                        <span className="font-mono text-xs text-slate-400">Disparado hace 18 minutos</span>
                      </div>
                      <h4 className="font-display text-base font-bold text-slate-100 mt-1">
                        Cadencia anormal de solicitudes DNS sobre puerto 53 UDP
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        4,800 consultas/minuto superando el umbral base configurado de 1,000 req/min.
                      </p>
                    </div>
                  </div>
                  <button className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-display text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors">
                    Revisar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. AI PANEL VIEW */}
          {activeTab === "ai" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
                <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-sky-400 animate-pulse" />
                    <span className="font-display text-sm font-bold text-slate-100">
                      Análisis Cognitivo Autónomo (Gemini 2.0 Flash)
                    </span>
                  </div>
                  <span className="font-mono text-xs text-sky-400 font-semibold bg-sky-500/20 px-2 py-0.5 rounded border border-sky-500/30">
                    LOTE 24H SINCRONIZADO
                  </span>
                </div>

                <div className="mt-3 text-xs sm:text-sm text-slate-200 leading-relaxed space-y-2">
                  <p>
                    <strong>Diagnóstico General:</strong> La red exhibe estabilidad nominal en el 98.4% de los endpoints evaluados. Sin embargo, se confirma una discrepancia severa de exfiltración en el host anonimizado <code className="text-sky-300 font-mono">h_e1194ac27b99</code>.
                  </p>
                  <p className="text-slate-300">
                    <strong>Correlación de Hechos:</strong> El pico de tráfico de 1.2 GB coincide exactamente con un incremento previo en consultas de puertos no estándar. No se observó inyección de malware gracias a la segmentación local.
                  </p>
                </div>

                <div className="mt-4 rounded-lg bg-slate-950/70 p-3 border border-sky-500/20">
                  <div className="text-xs font-mono uppercase tracking-wider text-sky-400 font-bold mb-2">
                    Recomendaciones Automatizadas de Defensa
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Aislar inmediatamente el adaptador Ethernet del host h_e1194ac27b99.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Limitar egress en router para tráfico UDP 53 a resolvers corporativos.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Auditar la lista blanca de puertos en la configuración del agente local.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 5. SETTINGS VIEW */}
          {activeTab === "settings" && (
            <div className="space-y-4 font-mono text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
                <h4 className="font-display text-sm font-semibold text-slate-200">
                  Gobernanza de Seguridad del Agente
                </h4>

                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-slate-950 border border-slate-850">
                    <div>
                      <div className="font-semibold text-slate-200">Token de Ingesta Autorizado</div>
                      <div className="text-slate-500 text-[11px]">Rotable con confirmación en dos pasos</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 bg-slate-900 px-2 py-1 rounded">sc_live_••••••••••••8f2a</span>
                      <button className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200">Rotar</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-850">
                    <div>
                      <div className="font-semibold text-slate-200">Anonimización Estricta de Hosts</div>
                      <div className="text-slate-500 text-[11px]">Convierte IPs en hash criptográfico local antes de reportar</div>
                    </div>
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                      HABILITADO
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-850">
                    <div>
                      <div className="font-semibold text-slate-200">Retención de Datos en la Nube</div>
                      <div className="text-slate-500 text-[11px]">Limpieza cron automática irreversible</div>
                    </div>
                    <span className="text-slate-300">30 Días (GDPR Friendly)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
