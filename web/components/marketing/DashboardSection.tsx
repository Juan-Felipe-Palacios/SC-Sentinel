// SC-Sentinel — DashboardSection: Explicación exhaustiva de cada card del dashboard
// Estructura visual de alto calibre inspirada en Stripe & Linear
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import DashboardPreview from "./DashboardPreview";
import {
  Activity,
  Server,
  ShieldAlert,
  Cpu,
  Sliders,
  Network,
  ArrowRight,
  CheckCircle2,
  Lock,
  Layers,
} from "lucide-react";

const CARDS_INFO = [
  {
    id: "overview",
    title: "Overview de Telemetría",
    subtitle: "Observabilidad determinista en vivo",
    icon: Activity,
    accent: "text-sky-400",
    border: "border-sky-500/20",
    bg: "bg-sky-500/5",
    description:
      "Panel de control unificado que consolida el estado del agente (Rust daemon), latencia de sincronización SWR (5s), curva de ancho de banda entrante/saliente y las anomalías de mayor criticidad.",
    details: [
      "Throughput de red (bytes in/out) renderizado en SVG sin delay.",
      "Monitor de ciclo de vida del spool local en caso de desconexión.",
      "Top 5 de endpoints de mayor consumo para diagnóstico rápido.",
    ],
  },
  {
    id: "hosts",
    title: "Inventario de Endpoints",
    subtitle: "Mapeo de hosts con scoring de riesgo",
    icon: Server,
    accent: "text-purple-400",
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
    description:
      "Tabla analítica de alto rendimiento con filtrado dinámico. Rastrea cada host, geolocalización por país de destino, volumen de paquetes y clasificación de amenaza según umbrales de heurística local.",
    details: [
      "Modo de anonimización: las direcciones IP reales se ofuscan con SHA-256 local.",
      "Métricas desglosadas por volumen de entrada, salida y conteo de paquetes.",
      "Ordenamiento instantáneo por nivel de riesgo (Crítico, Alto, Medio, Bajo).",
    ],
  },
  {
    id: "alerts",
    title: "Motor de Alertas con Evidencia",
    subtitle: "Cero falsos positivos sin respaldo empírico",
    icon: ShieldAlert,
    accent: "text-red-400",
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    description:
      "Las alertas en SC-Sentinel nunca son 'opiniones'. Cada incidente incluye un payload criptográfico inmutable con la ventana temporal, el umbral violado y los bytes exactos que dispararon la regla.",
    details: [
      "Auditoría con reglas deterministas probadas (exfiltración, flood DNS, port scans).",
      "Ciclo de vida operacional: Abierta → Aceptada → Resuelta con trazabilidad.",
      "Filtros por severidad para priorizar la respuesta del equipo de seguridad.",
    ],
  },
  {
    id: "ai",
    title: "Copiloto IA & Análisis RAG",
    subtitle: "Modelos cognitivos Gemini 2.0 / Groq",
    icon: Cpu,
    accent: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    description:
      "El modelo de IA no reemplaza al motor de red: actúa como analista senior sintetizando correlaciones entre lotes de 24 horas y emitiendo órdenes de remediación concretas.",
    details: [
      "Procesamiento exclusivo sobre señales agregadas: la IA jamás ve paquetes crudos.",
      "Degradación elegante: si el servicio de IA se suspende, las defensas siguen activas.",
      "Chat interactivo Cyberpunk con RAG integrado para consultar el estado en lenguaje natural.",
    ],
  },
  {
    id: "connections",
    title: "Matriz de Conexiones & Geo",
    subtitle: "Distribución de puertos y protocolos",
    icon: Network,
    accent: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    description:
      "Agrupación estadística por puertos destino (443 TLS, 53 DNS, 80 HTTP, etc.) y dispersión geográfica mundial para detectar comunicaciones sospechosas hacia ASNs hostiles.",
    details: [
      "Representación visual de tráfico geográfico por país con banderas SVG.",
      "Detección de puertos anómalos o túneles cifrados fuera de línea base.",
      "Solo conteos agregados en ventanas de 30 segundos; sin rastreo individual invasivo.",
    ],
  },
  {
    id: "settings",
    title: "Gobernanza y Privacidad",
    subtitle: "Control criptográfico del propietario",
    icon: Sliders,
    accent: "text-sky-300",
    border: "border-sky-400/20",
    bg: "bg-sky-400/5",
    description:
      "Administración total del perímetro: rotación de tokens de dispositivo en 2 pasos, políticas de retención con borrado cron definitivo y auditoría de sincronización TLS 1.3.",
    details: [
      "Token de dispositivo con hash SHA-256 determinista en el servidor.",
      "Interruptor de anonimización local sincronizado directamente con el daemon.",
      "Cumplimiento GDPR estricto: retención de 30 días con depuración irrevocable.",
    ],
  },
];

export default function DashboardSection() {
  return (
    <section id="dashboard" className="relative py-24 sm:py-32 border-b border-slate-800/80 bg-slate-950/60 overflow-hidden">
      {/* Glow ambiental de fondo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-sky-500/5 blur-[120px] pointer-events-none rounded-full" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Encabezado de la sección */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3.5 py-1 text-xs font-mono uppercase tracking-[0.2em] text-sky-300 mb-4">
            <Layers className="h-3.5 w-3.5" />
            SOC Enterprise Ready
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-100">
            Una consola de comando <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-purple-400">diseñada para la claridad total</span>.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400 leading-relaxed">
            Sin ruido visual ni paneles sobrecargados. Cada widget del dashboard de SC-Sentinel responde a un objetivo operacional concreto: saber qué ocurre en tu infraestructura sin sacrificar privacidad.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 font-display text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.3)] hover:brightness-110 transition-all"
            >
              Probar Demo en Vivo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-6 py-3 font-display text-sm font-semibold text-slate-300 hover:border-slate-700 hover:text-white transition-all"
            >
              <Lock className="h-4 w-4 text-slate-400" /> Acceso Administrativo
            </Link>
          </div>
        </div>

        {/* MOCKUP INTERACTIVO EN VIVO */}
        <div className="mb-20">
          <DashboardPreview />
        </div>

        {/* EXPLICACIÓN DETALLADA DE CADA CARD */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800/80">
            <div>
              <span className="font-mono text-xs text-sky-400 uppercase tracking-widest">
                Arquitectura de Cards
              </span>
              <h3 className="font-display text-2xl font-bold text-slate-100 mt-1">
                Anatomía de los Módulos del Dashboard
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-500 hidden sm:inline">
              6 Vistas Sincronizadas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CARDS_INFO.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.id}
                  className={`group rounded-2xl border ${card.border} ${card.bg} p-6 transition-all duration-300 hover:translate-y-[-2px] hover:border-sky-400/40 hover:shadow-[0_15px_40px_rgba(2,6,23,0.7)] backdrop-blur-sm`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl border border-slate-800 bg-slate-950/80 ${card.accent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-bold text-slate-100 group-hover:text-sky-300 transition-colors">
                        {card.title}
                      </h4>
                      <p className="font-mono text-[11px] text-slate-400">{card.subtitle}</p>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-5">
                    {card.description}
                  </p>

                  <div className="space-y-2 pt-4 border-t border-slate-800/80">
                    {card.details.map((detail, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-400">
                        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${card.accent}`} />
                        <span>{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
