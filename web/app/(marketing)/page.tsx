// SC-Sentinel — Home pública: Landing Page Next-Gen (M3/M4 Master Edition)
// Estética inspirada en Vercel, Linear y Cloudflare con Dashboard Interactivo y Copiloto IA
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import {
  ShieldCheck,
  Zap,
  Lock,
  Cpu,
  ArrowRight,
  ChevronRight,
  Terminal,
  Activity,
  Layers,
  CheckCircle2,
  Database,
} from "lucide-react";
import ArchitectureDiagram from "@/components/marketing/ArchitectureDiagram";
import DashboardSection from "@/components/marketing/DashboardSection";
import AIBenefitsSection from "@/components/marketing/AIBenefitsSection";
import { ChatWidget } from "@/components/chat/ChatWidget";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Detección Determinista de Anomalías de Red e IA",
  description:
    "Monitoreo de red con motor determinista en Rust local e inteligencia artificial Gemini 2.0. Las señales agregadas llegan a tu dashboard; tus paquetes crudos jamás salen de tu red.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/",
  },
  openGraph: {
    title: "SC-Sentinel — Observabilidad de Red Privada e IA",
    description:
      "Motor local en Rust + Señales criptográficas a la nube. Diagnóstico con IA sin filtrar paquetes crudos.",
    url: "https://sc-sentinel.vercel.app/",
    siteName: "SC-Sentinel",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SC-Sentinel — Shield de Anomalías" }],
  },
};

const FEATURE_GRID = [
  {
    icon: Terminal,
    title: "Motor Local en Rust sin Cajas Negras",
    badge: "Velocidad Nativa",
    color: "text-sky-400",
    border: "border-sky-500/20",
    bg: "bg-sky-500/5",
    body: "Compilado en código nativo para procesar gigabits por segundo sin pausas de garbage collection. Reconoce protocolos estándar y clasifica tráfico a velocidad de hardware.",
  },
  {
    icon: Lock,
    title: "Anonimización Criptográfica SHA-256",
    badge: "Privacidad Radical",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    body: "Las direcciones IP de tus dispositivos se hashean localmente con una sal rotativa. La nube y la IA solo ven identificadores anónimos y conteos agregados.",
  },
  {
    icon: ShieldCheck,
    title: "Alertas Respaldadas con Evidencia",
    badge: "Cero Falsos Positivos",
    color: "text-red-400",
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    body: "Olvídate de advertencias sin fundamento. Cada incidente incluye una firma criptográfica con la ventana de tiempo, los bytes involucrados y la regla violada.",
  },
  {
    icon: Cpu,
    title: "Copiloto IA Gemini 2.0 con RAG",
    badge: "Análisis Cognitivo",
    color: "text-purple-400",
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
    body: "Sintetiza lotes de 24 horas para descubrir pautas de exfiltración sigilosa ('low-and-slow'). Genera de inmediato pasos de remediación listos para mitigar.",
  },
  {
    icon: Database,
    title: "Spool Local Resiliente a Caídas",
    badge: "Offline-First",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    body: "Si la conectividad a Internet se interrumpe, el agente almacena los snapshots en una base SQLite local protegida y los transmite ordenadamente al reconectar.",
  },
  {
    icon: Zap,
    title: "Arquitectura Serverless Zero-Cost",
    badge: "Vercel + Neon",
    color: "text-cyan-400",
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    body: "Desplegado en infraestructura de borde sobre Next.js 15 y Postgres Serverless en Neon. Escalabilidad inmediata con costos operativos casi nulos.",
  },
];

const METRICS_STRIP = [
  { value: "0", label: "Paquetes Crudos Filtrados", sub: "100% Criptográficamente Seguro" },
  { value: "30s", label: "Ventana de Agregación", sub: "Muestreo Determinista Local" },
  { value: "< 5s", label: "Latencia de Sincronización", sub: "SWR Realtime en Dashboard" },
  { value: "100%", label: "Soberanía de Datos", sub: "Tus Redes, Tus Llaves" },
];

export default function MarketingHome() {
  return (
    <div className="relative">
      {/* ===================== HERO SECTION ===================== */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-32 border-b border-slate-800/80 overflow-hidden">
        {/* Mallas de iluminación radial */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-[radial-gradient(ellipse_50%_50%_at_50%_0%,rgba(56,189,248,0.18),transparent_80%)] pointer-events-none" />
        <div className="absolute top-1/4 right-10 w-96 h-96 bg-purple-500/10 blur-[130px] pointer-events-none rounded-full" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-sky-500/10 blur-[130px] pointer-events-none rounded-full" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            {/* Columna Izquierda: Headline & CTAs */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              {/* Badge de versión */}
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3.5 py-1 text-xs font-mono text-sky-300 backdrop-blur-md">
                <span className="sc-pulse-dot h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-semibold uppercase tracking-wider">SC-Sentinel v0.4</span>
                <span className="text-slate-500">|</span>
                <span>Strategic Connex Anomaly Shield</span>
              </div>

              {/* H1 Principal con gradiente Vercel-like */}
              <h1 className="font-display text-4xl sm:text-6xl lg:text-[68px] font-extrabold tracking-tight text-slate-100 leading-[1.06]">
                Ve lo que pasa en tu red.{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-purple-400">
                  Sin entregar tus paquetes crudos
                </span>{" "}
                a la nube.
              </h1>

              {/* Párrafo explicativo */}
              <p className="max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed mx-auto lg:mx-0">
                SC-Sentinel inspecciona el tráfico localmente con un motor determinista en Rust y despacha únicamente señales agregadas a tu dashboard. Cuando surge una anomalía, la IA la contextualiza con hechos verificables.
              </p>

              {/* CTAs de Alto Impacto */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3.5 font-display text-sm font-bold text-slate-950 shadow-[0_0_35px_rgba(56,189,248,0.35)] hover:brightness-110 transition-all hover:scale-[1.02]"
                >
                  <Activity className="h-4 w-4" />
                  Ver Demo en Vivo del Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/80 px-6 py-3.5 font-display text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-all"
                >
                  <Lock className="h-4 w-4 text-slate-400" />
                  Ingresar como Admin
                </Link>

                <Link
                  href="/funcionalidades"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-sky-300 px-3 py-2 transition-colors"
                >
                  Explorar Arquitectura <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Features pills directas */}
              <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-5 text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> 100% Rust Daemon
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Hash SHA-256 Nativo
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Copiloto Gemini 2.0
                </span>
              </div>
            </div>

            {/* Columna Derecha: Mockup Interactivo del Agente en Ejecución */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-slate-800/90 bg-[#070d19]/90 p-4 sm:p-5 shadow-[0_20px_80px_rgba(2,6,23,0.8),0_0_50px_rgba(56,189,248,0.1)] backdrop-blur-xl">
                {/* Cabecera de la terminal */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500/80" />
                    <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                    <span className="font-mono text-xs text-slate-400 ml-2">sc-agent: telemetry.ipc</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    CAPTURA ACTIVA
                  </span>
                </div>

                {/* Contenido en vivo simulado */}
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80">
                    <span className="text-slate-400">Interface Monitoreada:</span>
                    <span className="text-sky-300 font-semibold">eth0 (promiscuous)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60">
                      <div className="text-[10px] text-slate-500 uppercase">Throughput</div>
                      <div className="text-base font-bold text-sky-400 mt-0.5">842.1 Mbps</div>
                      <div className="text-[10px] text-slate-400">0 dropped packets</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60">
                      <div className="text-[10px] text-slate-500 uppercase">Spool Buffer</div>
                      <div className="text-base font-bold text-emerald-400 mt-0.5">0 Queued</div>
                      <div className="text-[10px] text-slate-400">Sync TLS OK</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-slate-400">
                      <span>Último Snapshot:</span>
                      <span className="text-slate-200">hace 2s (Ventana #4812)</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Hosts Identificados:</span>
                      <span className="text-sky-400 font-semibold">142 (Anonimizados)</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Geolocalización:</span>
                      <span className="text-slate-200">🇦🇷 AR 42% · 🇺🇸 US 28% · 🇩🇪 DE 12%</span>
                    </div>
                  </div>

                  {/* Alerta detectada en vivo */}
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                    <Activity className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-amber-300 text-xs">
                        Anomalía detectada por el motor local:
                      </div>
                      <div className="text-[11px] text-amber-200/80 mt-0.5">
                        Pico inusual en puerto 53 UDP desde host anonimizado <code className="text-sky-300 bg-slate-950 px-1 py-0.5 rounded">h_e1194ac</code>. Hechos listos para el dashboard.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between font-mono text-[11px] text-slate-400">
                  <span>Protección en Borde</span>
                  <Link href="/demo" className="text-sky-400 hover:underline flex items-center gap-1">
                    Ver en el Dashboard →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== METRICS STRIP ===================== */}
      <section className="border-b border-slate-800/80 bg-slate-950/60 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {METRICS_STRIP.map((metric, idx) => (
              <div key={idx} className="space-y-1">
                <div className="font-display text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">
                  {metric.value}
                </div>
                <div className="font-display text-sm font-semibold text-slate-200">
                  {metric.label}
                </div>
                <div className="font-mono text-xs text-slate-500">
                  {metric.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== DASHBOARD INTERACTIVO Y EXPLICACIÓN DE CARDS ===================== */}
      <DashboardSection />

      {/* ===================== BENEFICIOS DEL MODELO IA ===================== */}
      <AIBenefitsSection />

      {/* ===================== ARQUITECTURA DETALLADA ===================== */}
      <section id="arquitectura" className="relative py-24 sm:py-32 border-b border-slate-800/80 bg-slate-950/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3.5 py-1 text-xs font-mono uppercase tracking-[0.2em] text-sky-300 mb-4">
              <Layers className="h-3.5 w-3.5" />
              Ingeniería de Privacidad
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-100">
              Arquitectura Segregada: <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-purple-400">Zero-Raw-Packet Cloud</span>.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-400 leading-relaxed">
              Descubre paso a paso por qué es matemáticamente imposible que tus contraseñas, documentos o conversaciones privadas viajen a servidores externos.
            </p>
          </div>

          <ArchitectureDiagram />
        </div>
      </section>

      {/* ===================== FEATURE GRID TÉCNICO ===================== */}
      <section className="relative py-24 sm:py-32 border-b border-slate-800/80 bg-[#080e1b]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-100">
              Capacidades Principales de SC-Sentinel
            </h2>
            <p className="mt-3 text-base text-slate-400">
              Construido por y para ingenieros de infraestructura, seguridad y redes que exigen transparencia absoluta.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_GRID.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border ${feature.border} ${feature.bg} p-6 sm:p-7 hover:border-sky-400/40 transition-all duration-300 hover:shadow-[0_10px_35px_rgba(2,6,23,0.7)] backdrop-blur-sm`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2.5 rounded-xl border border-slate-800 bg-slate-950/80 ${feature.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                      {feature.badge}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-100 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {feature.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===================== CTA FINAL ===================== */}
      <section className="relative py-24 sm:py-32 overflow-hidden bg-gradient-to-b from-slate-950 to-[#040812]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.1),transparent_70%)] pointer-events-none" />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="rounded-3xl border border-sky-500/30 bg-slate-900/50 p-8 sm:p-14 shadow-[0_0_80px_rgba(56,189,248,0.15)] backdrop-blur-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3.5 py-1 text-xs font-mono text-sky-300 uppercase tracking-widest mb-6">
              Despliegue Inmediato
            </span>

            <h2 className="font-display text-3xl sm:text-5xl font-extrabold text-slate-100 tracking-tight max-w-2xl mx-auto leading-tight">
              Toma el control de tu tráfico con visibilidad <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-purple-400">segura y potenciada por IA</span>.
            </h2>

            <p className="mt-4 text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              Explora la demo interactiva en tiempo real o ingresa al panel de administración para gestionar tus tokens.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-8 py-4 font-display text-base font-bold text-slate-950 shadow-[0_0_40px_rgba(56,189,248,0.4)] hover:brightness-110 transition-all hover:scale-[1.02]"
              >
                Abrir Demo Pública en Vivo <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/contacto"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-8 py-4 font-display text-base font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700 transition-all"
              >
                Hablar con un Especialista
              </Link>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-slate-400">
              <span>✓ Sin tarjeta de crédito requerida</span>
              <span>✓ Código 100% auditable</span>
              <span>✓ Compatible con Linux, macOS & Windows</span>
            </div>
          </div>
        </div>
      </section>

      {/* Asistente Flotante Cyberpunk (ChatWidget con RAG de 24h) */}
      <ChatWidget />
    </div>
  );
}
