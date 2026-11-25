// SC-Sentinel — DashboardSection: Mockup interactivo + capturas reales de cada card del dashboard
// Estructura visual de alto calibre inspirada en Stripe & Linear
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import Link from "next/link";
import DashboardPreview from "./DashboardPreview";
import {
  Activity,
  BarChart3,
  Cpu,
  Globe2,
  Layers,
  Lock,
  Network,
  Search,
  Server,
  ShieldAlert,
  ArrowRight,
  Eye,
  LineChart,
} from "lucide-react";

interface DashboardCardDoc {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  icon: typeof Activity;
  accent: string;
  border: string;
  bg: string;
  purpose: string;
  visualization: string;
  highlights: string[];
}

const DASHBOARD_CARDS: DashboardCardDoc[] = [
  {
    id: "agent-health",
    title: "Agente de Captura y Colector NetFlow / IPFIX",
    subtitle: "Salud del daemon local y exportación de reportes",
    image: "/images/dashboard/agent-health.jpg",
    imageAlt: "Captura del panel de salud del agente de captura y colector NetFlow/IPFIX en SC-Sentinel",
    icon: Activity,
    accent: "text-emerald-400",
    border: "border-emerald-500/25",
    bg: "bg-emerald-500/5",
    purpose:
      "Supervisa en tiempo real la integridad operativa del agente local en Rust y del colector de flujos de red (NetFlow v9 / IPFIX), además de habilitar la exportación directa de resúmenes, hosts y alertas en formato CSV o XLSX.",
    visualization:
      "Muestra el estado de captura en línea, paquetes capturados, descartados, tasa de descarte, errores de parseo, profundidad de cola y uso del spool local; debajo desglosa datagramas recibidos, templates en caché y flujos normalizados.",
    highlights: ["Captura en línea", "NetFlow / IPFIX", "Exportación CSV y XLSX"],
  },
  {
    id: "kpi-summary",
    title: "KPIs Consolidados de Red",
    subtitle: "Resumen cuantitativo de la ventana temporal activa",
    image: "/images/dashboard/kpi-summary.png",
    imageAlt: "Captura de las 4 tarjetas KPI de Bytes Totales, Paquetes Totales, Alertas y Hosts Únicos",
    icon: BarChart3,
    accent: "text-sky-400",
    border: "border-sky-500/25",
    bg: "bg-sky-500/5",
    purpose:
      "Ofrece una lectura inmediata del volumen de tráfico, la carga de paquetes, las alertas disparadas y el alcance de endpoints observados durante el rango temporal seleccionado.",
    visualization:
      "Cuatro tarjetas métricas con desglose de bytes de entrada/salida (↑ / ↓), conteo de ventanas de 30 s agregadas, chips de severidad por alerta (crítica, alta, media, baja, info) y total de países observados.",
    highlights: ["Bytes In/Out", "Ventanas agregadas", "Chips de severidad"],
  },
  {
    id: "ai-analysis",
    title: "Análisis IA · Copiloto RAG",
    subtitle: "Síntesis cognitiva por lotes cada 30 segundos",
    image: "/images/dashboard/ai-analysis.jpg",
    imageAlt: "Captura del panel Análisis IA con diagnóstico sintético, hallazgos y recomendaciones",
    icon: Cpu,
    accent: "text-purple-400",
    border: "border-purple-500/25",
    bg: "bg-purple-500/5",
    purpose:
      "Traduce las señales agregadas y alertas deterministas en un diagnóstico claro para el operador, priorizando hallazgos y sugiriendo acciones concretas sin exponer paquetes crudos.",
    visualization:
      "Presenta un badge de riesgo global, un resumen narrativo del período, hallazgos etiquetados por categoría (puertos, alertas, tráfico), un bloque de recomendaciones accionables y trazabilidad del modelo y hash de hechos.",
    highlights: ["Copiloto RAG", "Hallazgos priorizados", "Recomendaciones accionables"],
  },
  {
    id: "traffic-dynamics",
    title: "Dinámica de Tráfico Temporal",
    subtitle: "Serie temporal interactiva multi-vista",
    image: "/images/dashboard/traffic-dynamics.jpg",
    imageAlt: "Captura del gráfico Dinámica de Tráfico con curvas de Bytes In y Bytes Out y selector de vistas",
    icon: LineChart,
    accent: "text-cyan-400",
    border: "border-cyan-500/25",
    bg: "bg-cyan-500/5",
    purpose:
      "Permite detectar picos anómalos, caídas de conectividad o patrones de exfiltración comparando el flujo entrante contra el saliente en tiempo real.",
    visualization:
      "Gráfico de área dual continuo (Bytes In en cian vs. Bytes Out en violeta) con refresco en vivo cada 5 s, barra inferior de zoom temporal y selector de modos visuales (Línea, Flujo, Sankey, Mapa, Radar, Velocidad y Calor).",
    highlights: ["Bytes In vs Out", "7 modos visuales", "Zoom temporal en vivo"],
  },
  {
    id: "host-investigation",
    title: "Investigación por Host",
    subtitle: "Análisis granular por endpoint sin flujos individuales",
    image: "/images/dashboard/host-investigation.jpg",
    imageAlt: "Captura del módulo Investigación por Host con lista lateral, gráfico de ventanas y línea de alertas",
    icon: Search,
    accent: "text-sky-300",
    border: "border-sky-400/25",
    bg: "bg-sky-400/5",
    purpose:
      "Facilita el diagnóstico focalizado sobre un host específico (por IP o host_key anonimizado) para correlacionar su comportamiento de tráfico con ventanas que registraron alertas.",
    visualization:
      "Incluye buscador por IP/hash, lista lateral con volumen y score de riesgo por host, curva temporal dedicada de entrada/salida y una línea de tiempo de ventanas que resalta coincidencias temporales con alertas.",
    highlights: ["Agregados de 30 s", "Scoring por host", "Línea temporal de alertas"],
  },
  {
    id: "top-hosts",
    title: "Principales Destinos por Tráfico",
    subtitle: "Ranking de endpoints con mayor consumo",
    image: "/images/dashboard/top-hosts.png",
    imageAlt: "Captura de la card Principales Destinos mostrando ranking Top 6 con banderas, IPs y riesgo",
    icon: Server,
    accent: "text-indigo-400",
    border: "border-indigo-500/25",
    bg: "bg-indigo-500/5",
    purpose:
      "Identifica rápidamente qué destinos concentran el mayor ancho de banda y qué nivel de riesgo les asignó el motor determinista.",
    visualization:
      "Lista ordenada con posición, bandera y país de origen, identificador del host, desglose de tráfico subido/bajado (↑ / ↓), badge de riesgo (Bajo, Medio, Alto), volumen total y cantidad de paquetes.",
    highlights: ["Top destinos", "Desglose ↑ / ↓", "Badge de riesgo"],
  },
  {
    id: "top-ports",
    title: "Puertos y Protocolos",
    subtitle: "Distribución de servicios y capa de transporte L4",
    image: "/images/dashboard/top-ports.png",
    imageAlt: "Captura de la card Puertos y Protocolos con barras proporcionales y distribución TCP/UDP",
    icon: Network,
    accent: "text-purple-300",
    border: "border-purple-400/25",
    bg: "bg-purple-400/5",
    purpose:
      "Audita qué servicios de red (HTTPS, HTTP, DNS, SSH, NTP, PostgreSQL, MySQL) dominan el tráfico y detecta uso inesperado de puertos.",
    visualization:
      "Ranking por puerto y servicio reconocido con etiqueta de protocolo (TCP/UDP), número de conexiones, volumen transferido, barras proporcionales y una barra inferior consolidada de distribución porcentual TCP vs. UDP.",
    highlights: ["Servicios L7", "Barras proporcionales", "Ratio TCP / UDP"],
  },
  {
    id: "geo-risk",
    title: "Tráfico por País y Riesgo del Sistema",
    subtitle: "Geolocalización agregada y postura global",
    image: "/images/dashboard/geo-risk.png",
    imageAlt: "Captura de las cards Tráfico por País y Riesgo del Sistema con score promedio 0.37",
    icon: Globe2,
    accent: "text-amber-400",
    border: "border-amber-500/25",
    bg: "bg-amber-500/5",
    purpose:
      "Combina la visibilidad geográfica de las comunicaciones externas con una evaluación consolidada del nivel de riesgo de los hosts monitoreados.",
    visualization:
      "A la izquierda muestra países con bandera, cantidad de hosts, porcentaje y barra de volumen; a la derecha exhibe el nivel global (Medio), score promedio numérico, barra segmentada y conteo por banda de riesgo.",
    highlights: ["GeoIP local", "Score promedio", "Bandas de riesgo"],
  },
  {
    id: "traffic-asn",
    title: "Tráfico por ASN (Sistemas Autónomos)",
    subtitle: "Visibilidad de proveedores y redes de destino",
    image: "/images/dashboard/traffic-asn.jpg",
    imageAlt: "Captura de la card Tráfico por ASN mostrando Cloudflare, Google, Amazon y Microsoft",
    icon: Layers,
    accent: "text-cyan-300",
    border: "border-cyan-400/25",
    bg: "bg-cyan-400/5",
    purpose:
      "Permite identificar a qué proveedores de nube o redes autónomas se dirige el tráfico (Cloudflare, Google, AWS, Microsoft), útil para detectar destinos atípicos o exfiltración hacia ASNs desconocidos.",
    visualization:
      "Listado de sistemas autónomos con número de ASN y organización, porcentaje de participación sobre el tráfico total, máximo de hosts observados por ventana, barra proporcional y volumen en GB/MB.",
    highlights: ["Redes autónomas", "Máx. hosts/ventana", "Participación %"],
  },
  {
    id: "recent-alerts",
    title: "Feed de Alertas Recientes",
    subtitle: "Incidentes deterministas con severidad y contexto",
    image: "/images/dashboard/recent-alerts.png",
    imageAlt: "Captura de la card Alertas Recientes con severidades Alta, Media, Baja e Info",
    icon: ShieldAlert,
    accent: "text-red-400",
    border: "border-red-500/25",
    bg: "bg-red-500/5",
    purpose:
      "Centraliza los últimos eventos anómalos disparados por el motor de reglas local para acelerar el triaje sin perder trazabilidad.",
    visualization:
      "Lista cronológica con chip de severidad codificado por color (Alta, Media, Baja, Info), título del evento, explicación breve de la regla activada y marca de tiempo relativa.",
    highlights: ["Severidad codificada", "Reglas deterministas", "Triaje inmediato"],
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
            Sin ruido visual ni paneles sobrecargados. Cada card del dashboard de SC-Sentinel responde a un objetivo operacional concreto: saber qué ocurre en tu infraestructura sin sacrificar privacidad.
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
        <div className="mb-24">
          <DashboardPreview />
        </div>

        {/* CAPTURAS REALES Y ANATOMÍA DE CADA CARD */}
        <div className="mt-16">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10 pb-4 border-b border-slate-800/80">
            <div>
              <span className="font-mono text-xs text-sky-400 uppercase tracking-widest">
                Capturas reales del Dashboard (Modo Visitante)
              </span>
              <h3 className="font-display text-2xl sm:text-3xl font-bold text-slate-100 mt-1">
                Anatomía de cada Card y sus Visualizaciones
              </h3>
            </div>
            <span className="inline-flex items-center gap-2 font-mono text-xs text-slate-400 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <Eye className="h-3.5 w-3.5 text-sky-400" />
              10 Vistas Documentadas
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {DASHBOARD_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.id}
                  className={`sc-card-glow group flex flex-col rounded-2xl border ${card.border} ${card.bg} overflow-hidden backdrop-blur-sm transition-all duration-300 hover:border-sky-400/40`}
                >
                  {/* Header de la card */}
                  <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl border border-slate-800 bg-slate-950/80 shrink-0 ${card.accent}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-display text-lg font-bold text-slate-100 group-hover:text-sky-300 transition-colors truncate">
                          {card.title}
                        </h4>
                        <p className="font-mono text-[11px] text-slate-400 truncate">{card.subtitle}</p>
                      </div>
                    </div>
                  </div>

                  {/* Captura real */}
                  <div className="px-6">
                    <div className="overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950 shadow-inner">
                      <img
                        src={card.image}
                        alt={card.imageAlt}
                        loading="lazy"
                        className="w-full h-auto object-cover object-top transition-transform duration-500 group-hover:scale-[1.01]"
                      />
                    </div>
                  </div>

                  {/* Descripción: para qué sirve y qué muestran las visualizaciones */}
                  <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400 font-semibold mb-1">
                          Para qué se utiliza
                        </p>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {card.purpose}
                        </p>
                      </div>

                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-400 font-semibold mb-1">
                          Qué muestran las visualizaciones
                        </p>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                          {card.visualization}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-800/80">
                      {card.highlights.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-slate-800 bg-slate-950/70 px-2.5 py-0.5 font-mono text-[10px] text-slate-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
