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
  Server,
  Network,
  Globe2,
  LayoutDashboard,
} from "lucide-react";
import ArchitectureDiagram from "@/components/marketing/ArchitectureDiagram";
import DashboardSection from "@/components/marketing/DashboardSection";
import AIBenefitsSection from "@/components/marketing/AIBenefitsSection";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { PRODUCT, PRODUCT_VERSION_LABEL } from "@/lib/product-facts";

export const metadata = {
  metadataBase: new URL("https://sc-sentinel.vercel.app"),
  title: "SC-Sentinel — Detección Determinista de Anomalías de Red e IA",
  description:
    "Monitoreo de red con motor determinista en Rust local, captura PCAP y colector NetFlow/IPFIX. Las señales agregadas llegan a tu dashboard; tus paquetes crudos jamás salen de tu red.",
  alternates: {
    canonical: "https://sc-sentinel.vercel.app/",
  },
  openGraph: {
    title: "SC-Sentinel — Observabilidad de Red Privada e IA",
    description:
      "Motor local en Rust + señales agregadas a la nube. Diagnóstico con IA sin filtrar paquetes crudos.",
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
    title: "Motor determinista local",
    badge: "9 reglas v1",
    color: "text-sky-400",
    border: "border-sky-500/20",
    bg: "bg-sky-500/5",
    body: "Reglas explícitas para blacklist, escaneo de puertos, DNS anómalo, volumen y salud del enlace. Cada alerta puede explicar qué umbral se superó y con qué hechos.",
  },
  {
    icon: Lock,
    title: "Anonimización opcional HMAC-SHA-256",
    badge: "Configurable",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    body: "Con anonymize_hosts activo, los identificadores se derivan localmente con HMAC-SHA-256. La clave vive en tu equipo; la nube recibe host marks y conteos.",
  },
  {
    icon: ShieldCheck,
    title: "Alertas con evidencia estructurada",
    badge: "Explicables",
    color: "text-red-400",
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    body: "Cada incidente incluye regla, severidad, ventana, hosts y métricas que dispararon la detección. Es evidencia auditable, no una caja negra.",
  },
  {
    icon: Cpu,
    title: `${PRODUCT.models.label} como copiloto`,
    badge: "Con fallback",
    color: "text-purple-400",
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
    body: "La IA interpreta hechos agregados y sugiere pasos; no crea alertas ni decide. Si el proveedor falla, la cadena cae a OpenRouter o Groq y el motor sigue funcionando.",
  },
  {
    icon: Database,
    title: "Colector NetFlow / IPFIX",
    badge: "M4 cerrado",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    body: "Además de PCAP, el agente recibe NetFlow v5/v9 e IPFIX de routers y switches, normaliza los flujos y los suma a las mismas ventanas de 30 segundos.",
  },
  {
    icon: Zap,
    title: "Servicio Windows + GUI opcional",
    badge: "M5 cerrado",
    color: "text-cyan-400",
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    body: "SC-Sentinel-Agent corre como servicio con auto-start, recovery y stop con drenaje. sc-gui muestra estado, stats y enrolamiento desde la bandeja.",
  },
];

const METRICS_STRIP = [
  { value: `${PRODUCT.windowSeconds}s`, label: "Ventana de agregación", sub: "PCAP + NetFlow/IPFIX" },
  { value: `${PRODUCT.swrSeconds}s`, label: "Refresco del dashboard", sub: "SWR sobre señales agregadas" },
  { value: String(PRODUCT.detectionRules.length), label: "Reglas deterministas", sub: "Evaluadas antes del spool" },
  { value: "2", label: "Modos de observación", sub: "Captura local y colector" },
];

const NEWS_STRIP = [
  {
    icon: Globe2,
    badge: "0.1.6",
    title: "GeoLite2 ASN",
    body: "top_asns en cada ventana y estado de carga independiente para Country y ASN. Si la base falta, el agente sigue capturando.",
  },
  {
    icon: Server,
    badge: "M5",
    title: "Servicio Windows",
    body: "Auto-start, recovery 5/10/30 s, stop con drenaje, log a archivo e instalador idempotente con verificación SHA256.",
  },
  {
    icon: LayoutDashboard,
    badge: "Opcional",
    title: "GUI de escritorio",
    body: "sc-gui consume /status por loopback y ofrece Estado, Stats, Enrolar y Ajustes desde la bandeja del sistema.",
  },
  {
    icon: Network,
    badge: "M4",
    title: "Colector NetFlow/IPFIX",
    body: "NetFlow v5/v9 e IPFIX de routers y switches, normalizados a las mismas ventanas que la captura local.",
  },
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
                <span className="font-semibold uppercase tracking-wider">SC-Sentinel {PRODUCT_VERSION_LABEL}</span>
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
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Servicio Windows
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> PCAP + NetFlow/IPFIX
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> GeoLite2 ASN local
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> IA con fallback
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
                <div className="flex items-center justify-end">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Datos de ejemplo
                  </span>
                </div>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80">
                    <span className="text-slate-400">Fuentes activas:</span>
                    <span className="text-sky-300 font-semibold">eth0 + NetFlow/IPFIX</span>
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
                      <span>Hosts identificados:</span>
                      <span className="text-sky-400 font-semibold">142 (HMAC opcional)</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Geo + ASN:</span>
                      <span className="text-slate-200">🇦🇷 AR 42% · 🇺🇸 US 28% · AS15169 12%</span>
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
                        Regla <code className="text-sky-300 bg-slate-950 px-1 py-0.5 rounded">dns_tunneling</code> sobre <code className="text-sky-300 bg-slate-950 px-1 py-0.5 rounded">h_e1194ac</code>: 100+ consultas y 64 KB en la ventana. Hechos listos para el dashboard.
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

      {/* ===================== NOVEDADES 0.1.6 ===================== */}
      <section aria-labelledby="novedades-016" className="border-b border-slate-800/80 bg-[#080e1b] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3.5 py-1 text-xs font-mono uppercase tracking-[0.2em] text-sky-300">
                <Zap className="h-3.5 w-3.5" />
                Nuevo en {PRODUCT.version}
              </div>
              <h2 id="novedades-016" className="mt-4 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
                Lo último del agente, sin cambiar la promesa central.
              </h2>
            </div>
            <Link
              href={PRODUCT.releaseNotesHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors"
            >
              Ver todas las novedades <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NEWS_STRIP.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="p-2.5 rounded-xl border border-sky-500/20 bg-sky-500/5 text-sky-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-100">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
                </article>
              );
            })}
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
              Descubre paso a paso qué sale de tu red, qué se queda en el equipo y por qué la nube no recibe paquetes crudos.
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
              Operación continua
            </span>

            <h2 className="font-display text-3xl sm:text-5xl font-extrabold text-slate-100 tracking-tight max-w-2xl mx-auto leading-tight">
              Toma el control de tu tráfico con visibilidad <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-purple-400">segura y potenciada por IA</span>.
            </h2>

            <p className="mt-4 text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              Explorá la demo interactiva, revisá las novedades de la release o escribinos para coordinar un despliegue.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-8 py-4 font-display text-base font-bold text-slate-950 shadow-[0_0_40px_rgba(56,189,248,0.4)] hover:brightness-110 transition-all hover:scale-[1.02]"
              >
                Abrir Demo Pública en Vivo <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/novedades"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-8 py-4 font-display text-base font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700 transition-all"
              >
                Ver novedades 0.1.6
              </Link>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              ¿Necesitás coordinar un despliegue? <Link href="/contacto" className="font-semibold text-sky-400 hover:text-sky-300">Hablemos por LinkedIn</Link>.
            </p>

            <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-slate-400">
              <span>✓ Windows con servicio</span>
              <span>✓ Linux como colector</span>
              <span>✓ Paquetes crudos nunca en la nube</span>
            </div>
          </div>
        </div>
      </section>

      {/* Asistente Flotante Cyberpunk (ChatWidget con RAG de 24h) */}
      <ChatWidget />
    </div>
  );
}
