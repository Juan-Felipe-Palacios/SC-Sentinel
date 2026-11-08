// SC-Sentinel — ArchitectureDiagram: Diagrama SVG animado de flujo de datos
// Local Rust PCAP → Agregación Hash → Sincronización TLS 1.3 → Cloud Dashboard & Gemini RAG
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export default function ArchitectureDiagram() {
  return (
    <figure className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-800/90 bg-[#070d19]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/80 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-200 font-semibold uppercase tracking-wider">Flujo Seguro de Datos End-to-End</span>
        </div>
        <div className="text-slate-400">
          Frontera Estricta: <span className="text-sky-400">Tu Red Privada</span> vs <span className="text-purple-400">Nube Serverless</span>
        </div>
      </div>

      <svg
        viewBox="0 0 920 320"
        role="img"
        aria-labelledby="arch-title arch-desc"
        className="h-auto w-full overflow-visible"
      >
        <title id="arch-title">Arquitectura de SC-Sentinel</title>
        <desc id="arch-desc">
          El agente local analiza tráfico en la PC o router, aplica motor determinista en Rust, envía solo hashes a la nube, y el dashboard procesa con IA Gemini.
        </desc>

        <defs>
          {/* Marcadores de flecha */}
          <marker id="arrow-sky" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" />
          </marker>
          <marker id="arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#c084fc" />
          </marker>
          <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#34d399" />
          </marker>

          {/* Gradientes */}
          <linearGradient id="grad-local" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id="grad-cloud" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        {/* ===================== ZONA LOCAL ===================== */}
        <rect x="10" y="20" width="560" height="280" rx="16" fill="url(#grad-local)" stroke="#1e293b" strokeWidth="1.5" />
        <text x="30" y="48" fill="#38bdf8" fontSize="12" fontWeight="700" fontFamily="var(--font-mono)" letterSpacing="1.5">
          ENTORNO LOCAL DEL CLIENTE (TU MÁQUINA / ROUTER MIKROTIK)
        </text>

        {/* 1. Agente Capturador */}
        <g transform="translate(30, 75)">
          <rect width="150" height="135" rx="12" fill="#090f1d" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.4" />
          <circle cx="24" cy="24" r="6" fill="#10b981" />
          <text x="38" y="28" fill="#f8fafc" fontSize="13" fontWeight="700" fontFamily="var(--font-display)">
            Agente Rust
          </text>
          <text x="20" y="55" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">• PCAP Promiscuo</text>
          <text x="20" y="75" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">• NetFlow / IPFIX</text>
          <text x="20" y="95" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">• Spool SQLite local</text>
          <rect x="15" y="105" width="120" height="20" rx="4" fill="#10b981" fillOpacity="0.15" />
          <text x="75" y="119" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">
            Zero Raw Leak
          </text>
        </g>

        {/* Flecha animada 1 -> 2 */}
        <line x1="180" y1="142" x2="225" y2="142" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 4" className="sc-animate-dash" markerEnd="url(#arrow-sky)" />

        {/* 2. Motor Determinista */}
        <g transform="translate(230, 75)">
          <rect width="155" height="135" rx="12" fill="#090f1d" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.4" />
          <circle cx="24" cy="24" r="6" fill="#38bdf8" />
          <text x="38" y="28" fill="#f8fafc" fontSize="13" fontWeight="700" fontFamily="var(--font-display)">
            Motor Determinista
          </text>
          <text x="20" y="55" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">• Ventana de 30s</text>
          <text x="20" y="75" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">• Detección heurística</text>
          <text x="20" y="95" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">• Evaluación umbrales</text>
          <rect x="15" y="105" width="125" height="20" rx="4" fill="#38bdf8" fillOpacity="0.15" />
          <text x="77" y="119" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">
            Evidencia Cripto
          </text>
        </g>

        {/* Flecha animada 2 -> 3 */}
        <line x1="385" y1="142" x2="425" y2="142" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 4" className="sc-animate-dash" markerEnd="url(#arrow-sky)" />

        {/* 3. Sanitizador y Cifrador */}
        <g transform="translate(430, 75)">
          <rect width="120" height="135" rx="12" fill="#090f1d" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.6" />
          <circle cx="20" cy="24" r="5" fill="#10b981" />
          <text x="32" y="28" fill="#f8fafc" fontSize="12" fontWeight="700" fontFamily="var(--font-display)">
            Sanitizador
          </text>
          <text x="14" y="55" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• Hash SHA-256</text>
          <text x="14" y="75" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• Agrupación IP</text>
          <text x="14" y="95" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• Comprime Gzip</text>
          <rect x="10" y="105" width="100" height="20" rx="4" fill="#10b981" fillOpacity="0.2" />
          <text x="60" y="119" textAnchor="middle" fill="#34d399" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)">
            TLS 1.3 Out
          </text>
        </g>

        {/* ===================== LÍNEA DIVISORIA FRONTERA ===================== */}
        <line x1="590" y1="20" x2="590" y2="300" stroke="#f43f5e" strokeWidth="2" strokeDasharray="6 6" />
        <rect x="575" y="130" width="30" height="40" rx="6" fill="#020617" stroke="#f43f5e" />
        <text x="590" y="155" textAnchor="middle" fill="#f43f5e" fontSize="14">🔒</text>

        {/* ===================== ZONA CLOUD ===================== */}
        <rect x="610" y="20" width="300" height="280" rx="16" fill="url(#grad-cloud)" stroke="#4338ca" strokeWidth="1.5" />
        <text x="630" y="48" fill="#c084fc" fontSize="12" fontWeight="700" fontFamily="var(--font-mono)" letterSpacing="1.5">
          CLOUD NUBE (VERCEL + NEON)
        </text>

        {/* 4. Dashboard Web & API Ingest */}
        <g transform="translate(630, 75)">
          <rect width="125" height="135" rx="12" fill="#090f1d" stroke="#818cf8" strokeWidth="1.5" strokeOpacity="0.5" />
          <text x="16" y="28" fill="#f8fafc" fontSize="12" fontWeight="700" fontFamily="var(--font-display)">
            Next.js App
          </text>
          <text x="14" y="55" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• /api/ingest</text>
          <text x="14" y="75" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• Rate Limit (60/m)</text>
          <text x="14" y="95" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• Neon DB Postgres</text>
          <rect x="10" y="105" width="105" height="20" rx="4" fill="#818cf8" fillOpacity="0.15" />
          <text x="62" y="119" textAnchor="middle" fill="#a5b4fc" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)">
            Dashboard SWR
          </text>
        </g>

        {/* Flecha conectora Ingest -> IA */}
        <line x1="755" y1="142" x2="785" y2="142" stroke="#c084fc" strokeWidth="2" strokeDasharray="4 4" className="sc-animate-dash" markerEnd="url(#arrow-purple)" />

        {/* 5. Copiloto IA Gemini RAG */}
        <g transform="translate(790, 75)">
          <rect width="105" height="135" rx="12" fill="#090f1d" stroke="#c084fc" strokeWidth="1.5" />
          <circle cx="20" cy="24" r="5" fill="#c084fc" />
          <text x="32" y="28" fill="#f8fafc" fontSize="11" fontWeight="700" fontFamily="var(--font-display)">
            Gemini 2.0
          </text>
          <text x="12" y="55" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• RAG 24h</text>
          <text x="12" y="75" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• Síntesis Lote</text>
          <text x="12" y="95" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">• Remedios</text>
          <rect x="8" y="105" width="89" height="20" rx="4" fill="#c084fc" fillOpacity="0.2" />
          <text x="52" y="119" textAnchor="middle" fill="#e9d5ff" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)">
            Copiloto SOC
          </text>
        </g>

        {/* Banner inferior: lo que se transporta */}
        <rect x="30" y="235" width="860" height="45" rx="8" fill="#020617" stroke="#1e293b" />
        <text x="50" y="262" fill="#10b981" fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">
          ✓ LO QUE VIAJA:
        </text>
        <text x="170" y="262" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">
          Conteo de bytes por protocolo, geolocalización agregada (países) y hashes SHA-256 de hosts.
        </text>

        <text x="640" y="262" fill="#ef4444" fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">
          ✗ NUNCA SALE:
        </text>
        <text x="750" y="262" fill="#fca5a5" fontSize="11" fontFamily="var(--font-mono)">
          Paquetes crudos ni IPs reales.
        </text>
      </svg>
      <figcaption className="mt-4 text-center font-mono text-[11px] text-slate-500 uppercase tracking-widest">
        Figura 1.0 — Pipeline de Datos Criptográfico y Segregación de Responsabilidades
      </figcaption>
    </figure>
  );
}
