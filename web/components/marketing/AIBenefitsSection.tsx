// SC-Sentinel — AIBenefitsSection: Inteligencia Artificial en Detección de Vulnerabilidades
// Profundidad técnica, contraste determinista vs IA y casos de uso de seguridad
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import {
  Brain,
  Zap,
  Layers,
  Sparkles,
  Database,
  TrendingDown,
  TerminalSquare,
  Lock,
} from "lucide-react";
import Link from "next/link";

const AI_PILLARS = [
  {
    icon: Brain,
    title: "Correlación sobre hechos agregados",
    tag: "Gemini 3.6 Flash / OpenRouter / Groq",
    desc: "La IA recibe ventanas agregadas de hasta 24 horas para contextualizar lo que el motor ya marcó. No descubre paquetes ni genera alertas primarias: explica patrones y ayuda a priorizar.",
    benefit: "Convierte señales dispersas en un diagnóstico legible para el operador.",
  },
  {
    icon: Database,
    title: "RAG en la nube con datos sanitizados",
    tag: "Solo señales agregadas",
    desc: "El contexto RAG se arma con hosts, puertos, países/ASN, alertas y salud del agente. No incluye paquetes crudos ni payloads; si la anonimización está activa, la nube trabaja con host marks.",
    benefit: "Menos superficie de exposición sin perder contexto operativo.",
  },
  {
    icon: TrendingDown,
    title: "Menos fatiga de alertas",
    tag: "Priorización asistida",
    desc: "La IA agrupa hallazgos relacionados y redacta un resumen con severidad. El operador sigue viendo las reglas, los umbrales y la evidencia que disparó cada alerta.",
    benefit: "Ayuda a ordenar el triaje sin ocultar la fuente determinista.",
  },
  {
    icon: TerminalSquare,
    title: "Recomendaciones accionables",
    tag: "Sugerencias, no ejecución",
    desc: "El análisis devuelve pasos de mitigación en texto para que el administrador los valide. No ejecuta bloqueos, no modifica routers y no reemplaza el juicio humano.",
    benefit: "Acelera la respuesta sin automatizar decisiones de red.",
  },
];

const COMPARATIVE_MATRIX = [
  {
    feature: "Captura y análisis de tráfico",
    deterministic: "Motor Rust local con PCAP y colector NetFlow/IPFIX",
    ai: "No toca la red física; procesa únicamente señales agregadas",
    verdict: "La captura y la decisión viven en el agente",
  },
  {
    feature: "Generación de alertas primarias",
    deterministic: "Nueve reglas con umbrales explícitos y evidencia estructurada",
    ai: "No crea alertas; interpreta y correlaciona hechos existentes",
    verdict: "La IA no es la fuente de verdad",
  },
  {
    feature: "Resiliencia ante caídas",
    deterministic: "Spool SQLite local y reintento cuando vuelve la conexión",
    ai: "Modo degradado sin interrumpir las alertas del motor",
    verdict: "El motor determinista sigue operando sin IA",
  },
  {
    feature: "Privacidad de la información",
    deterministic: "Anonimización HMAC-SHA-256 opcional, derivada en el equipo",
    ai: "Recibe hosts, conteos y metadatos agregados; nunca payloads",
    verdict: "Sin paquetes crudos en el contexto de la IA",
  },
  {
    feature: "Cadencia de ejecución",
    deterministic: "Ventanas de 30 segundos continuas",
    ai: "Hasta un análisis nuevo cada 15 minutos y bajo demanda",
    verdict: "Cadencia acotada para no gastar cuota de forma descontrolada",
  },
];

export default function AIBenefitsSection() {
  return (
    <section id="ai-engine" className="relative py-24 sm:py-32 border-b border-slate-800/80 bg-[#060b17] overflow-hidden">
      {/* Luces y mallas de fondo */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 blur-[130px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-sky-500/5 blur-[130px] pointer-events-none rounded-full" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Cabecera */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1 text-xs font-mono uppercase tracking-[0.2em] text-purple-300 mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Vulnerability AI Engine
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-100">
            Inteligencia Artificial para <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-300 to-sky-400">interpretar lo que el motor ya marcó</span>.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400 leading-relaxed">
            Combinamos la precisión matemática del software en Rust con la capacidad de síntesis de modelos LLM de última generación. Una simbiosis perfecta entre velocidad local y razonamiento en la nube.
          </p>
        </div>

        {/* 4 Pilares de la IA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
          {AI_PILLARS.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 hover:border-purple-500/30 transition-all duration-300 hover:shadow-[0_10px_40px_rgba(168,85,247,0.08)] backdrop-blur-sm"
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-slate-100">
                      {pillar.title}
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2.5 py-1 rounded-full shrink-0">
                    {pillar.tag}
                  </span>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                  {pillar.desc}
                </p>

                <div className="flex items-start gap-2 pt-3 border-t border-slate-800 text-xs font-mono text-purple-300">
                  <Zap className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>Impacto: {pillar.benefit}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Matriz comparativa: Determinista vs IA */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs text-sky-400 uppercase tracking-widest">
                <Layers className="h-4 w-4" />
                Doble Capa de Protección
              </div>
              <h3 className="font-display text-2xl font-bold text-slate-100 mt-1">
                Motor Determinista Local vs Copiloto de IA en la Nube
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md">
              Comprende exactamente qué responsabilidad asume el motor en tu equipo y qué valor aporta la nube.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 font-semibold">Criterio Operacional</th>
                  <th className="py-3 px-4 font-semibold text-sky-400">1. Motor Rust Local (PCAP + flows)</th>
                  <th className="py-3 px-4 font-semibold text-purple-400">2. Copiloto IA (Cloud RAG)</th>
                  <th className="py-3 px-4 font-semibold text-emerald-400">Garantía Arquitectónica</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {COMPARATIVE_MATRIX.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-4 font-display font-semibold text-slate-200 text-sm">
                      {row.feature}
                    </td>
                    <td className="py-4 px-4 text-slate-300">
                      {row.deterministic}
                    </td>
                    <td className="py-4 px-4 text-purple-200/90">
                      {row.ai}
                    </td>
                    <td className="py-4 px-4 text-emerald-400 font-semibold">
                      ✓ {row.verdict}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span>El contexto enviado se limita a señales agregadas; no se envían paquetes crudos.</span>
            </div>
            <Link
              href="/demo"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-sky-400 hover:text-sky-300 transition-colors"
            >
              Ver el copiloto IA respondiendo en vivo →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
