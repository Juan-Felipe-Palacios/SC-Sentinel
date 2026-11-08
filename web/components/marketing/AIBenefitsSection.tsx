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
    title: "Correlación Contextual Histórica",
    tag: "Gemini 2.0 Flash / Groq",
    desc: "A diferencia de las reglas estáticas puntuales, los modelos IA analizan ventanas agregadas de 24 horas para descubrir pautas de exfiltración lenta ('low-and-slow') que evaden IDS tradicionales.",
    benefit: "Detecta ataques distribuidos que consumen poco ancho de banda por ventana.",
  },
  {
    icon: Database,
    title: "RAG Local con Datos Sanitizados",
    tag: "100% Sin Paquetes Crudos",
    desc: "La arquitectura RAG (Retrieval-Augmented Generation) alimenta al modelo solo con hashes anonimizados, métricas de entropía y estadísticas por puerto. Cero filtración de credenciales o payloads.",
    benefit: "Cumplimiento estricto de privacidad empresarial sin riesgos de fuga en el prompt.",
  },
  {
    icon: TrendingDown,
    title: "Drástica Reducción de Fatiga de Alertas",
    tag: "Priorización Cognitiva",
    desc: "Un equipo SOC no puede revisar 10,000 logs diarios. La IA agrupa anomalías conexas, descarta ruido operacional legítimo y produce un diagnóstico unificado con severidad calibrada.",
    benefit: "Ahorra hasta el 80% del tiempo de triaje de incidentes para los analistas.",
  },
  {
    icon: TerminalSquare,
    title: "Prescripción de Remediación Inmediata",
    tag: "Actionable Defense",
    desc: "No solo te informa 'hubo un problema'; genera scripts de bloqueo para iptables/Mikrotik, reglas Snort y pasos de aislamiento de host listos para ser validados por el administrador.",
    benefit: "Convierte una detección pasiva en una respuesta a incidentes en segundos.",
  },
];

const COMPARATIVE_MATRIX = [
  {
    feature: "Captura & Análisis de Tráfico",
    deterministic: "Motor Rust local a velocidad de cable (PCAP / promiscuous)",
    ai: "No toca la red física; procesa únicamente señales agregadas",
    verdict: "Sin impacto en la CPU ni latencia de red",
  },
  {
    feature: "Generación de Alertas Primarias",
    deterministic: "Reglas matemáticas y umbrales deterministas estrictos",
    ai: "No inventa alertas; interpreta y correlaciona eventos existentes",
    verdict: "Cero alucinaciones como fuente de verdad",
  },
  {
    feature: "Resiliencia ante Caídas",
    deterministic: "100% Offline-First (continúa protegiendo sin internet)",
    ai: "Degrada elegantemente sin interrumpir las alertas del motor",
    verdict: "Disponibilidad crítica ininterrumpida",
  },
  {
    feature: "Privacidad de la Información",
    deterministic: "Ofuscación SHA-256 local en el host del cliente",
    ai: "Recibe únicamente hashes y números enteros agregados",
    verdict: "Imposible reconstruir el contenido de tus paquetes",
  },
  {
    feature: "Cadencia de Ejecución",
    deterministic: "Micro-ventanas de 30 segundos continuas",
    ai: "Lotes cognitivos inteligentes cada 15 min / bajo demanda",
    verdict: "Eficiencia de costos en la nube (Vercel Serverless)",
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
            Inteligencia Artificial para <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-300 to-sky-400">descubrir lo que las reglas no ven</span>.
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
                  <th className="py-3 px-4 font-semibold text-sky-400">1. Motor Rust Local (PCAP)</th>
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
              <span>Garantía Contractual: Nunca compartimos tus datos con modelos públicos de entrenamiento.</span>
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
