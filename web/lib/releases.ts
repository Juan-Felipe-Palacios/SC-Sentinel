// SC-Sentinel — notas públicas de release.
// Fuente: docs/release/changelog.md (entradas orientadas a usuario/operador).
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export interface ReleaseGroup {
  added?: string[];
  changed?: string[];
  fixed?: string[];
  security?: string[];
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlight: string;
  groups: ReleaseGroup;
}

export const RELEASES: ReleaseNote[] = [
  {
    version: "0.1.6",
    date: "14 nov 2026",
    title: "GeoLite2 ASN y lectura de país más completa",
    summary:
      "El agente incorpora la base ASN de MaxMind y expone los sistemas autónomos dominantes en cada ventana, sin dejar de funcionar si la base no está disponible.",
    highlight: "ASN opcional en el snapshot y estado de carga separado para Country y ASN.",
    groups: {
      added: [
        "Soporte opcional de GeoLite2-ASN: top_asns en el snapshot.",
        "Flags geo_asn_loaded y geo_country_loaded en /status.",
        "La base ASN se carga de forma independiente; si falta, top_asns queda vacío sin impedir el arranque.",
      ],
      changed: [
        "WindowSnapshot y los contratos Zod/JSON aceptan top_asns como campo opcional.",
        "El paquete de Windows incluye GeoLite2-ASN y verifica su instalación junto con Country.",
      ],
    },
  },
  {
    version: "0.1.5",
    date: "13 nov 2026",
    title: "GUI de escritorio y paquete más verificable",
    summary:
      "El instalador de Windows incorpora sc-gui y las sumas SHA256 se calculan desde el binario compilado, no desde la copia temporal.",
    highlight: "GUI con bandeja, cuatro vistas y consumo de /status por loopback.",
    groups: {
      added: [
        "sc-gui.exe y abrir-gui.bat en el paquete de Windows.",
        "La GUI ofrece Estado, Stats, Enrolar y Ajustes, y se instala junto al servicio sin depender de él.",
        "El token de ingesta se pasa por entorno, nunca por argumentos del proceso.",
      ],
      changed: [
        "SHA256SUMS.txt se calcula desde el origen y el empaquetador aborta si la copia temporal difiere.",
        "El desinstalador borra la GUI antes del directorio, sin residuos.",
      ],
      fixed: [
        "El token deja de aparecer en el argv y en la cabecera del transcript de instalación.",
      ],
    },
  },
  {
    version: "0.1.4",
    date: "12 nov 2026",
    title: "Entrega de Linux alineada con la release",
    summary:
      "La guía incluida en el paquete de Linux apunta siempre a la versión publicada y el empaquetador corta si detecta versiones desalineadas.",
    highlight: "Menos riesgo de instalar un binario antiguo o roto.",
    groups: {
      added: [
        "check-doc-versions.ps1 como gate de coherencia entre runbooks, scripts y versión de Rust.",
      ],
      fixed: [
        "INSTALACION-LINUX.md se reescribe con la versión real del artefacto.",
        "El empaquetador aborta si un fichero de texto menciona otra versión.",
      ],
    },
  },
  {
    version: "0.1.3",
    date: "12 nov 2026",
    title: "Motor determinista local y agente Windows completo",
    summary:
      "La release de Windows se compila con captura live, incluye GeoLite2 Country, deja de filtrar rutas de compilación y suma el motor sc-detect antes del spool.",
    highlight: "Nueve reglas deterministas evaluadas localmente antes de persistir la ventana.",
    groups: {
      added: [
        "sc-detect: blacklist, escaneo de puertos saliente y entrante, DNS, volumen y salud del enlace.",
        "GeoLite2 Country en runtime, con SC_GEOIP_DB y fallback NoLookup.",
        "SHA256SUMS.txt con todos los ficheros del paquete.",
      ],
      changed: [
        "La release de Windows usa --features sc-capture/live y ya no publica un binario sin captura.",
        "El binario se compila con remap de rutas para no exponer la máquina de build.",
        "La release de Linux se mantiene como colector, sin enlazar libpcap.",
      ],
      fixed: [
        "Rutas relativas del config.toml resueltas contra el directorio del config.",
        "El fixture pcap y la base GeoLite2 ya no dependen de CARGO_MANIFEST_DIR.",
      ],
    },
  },
  {
    version: "0.1.2",
    date: "12 nov 2026",
    title: "Cierre de ventanas por tiempo",
    summary:
      "La ventana de métricas se cierra por tiempo aunque no llegue tráfico nuevo, evitando retrasos y pérdidas en redes con tráfico esporádico.",
    highlight: "Corrección del agregador con test de regresión.",
    groups: {
      fixed: [
        "WindowAggregator comprueba el límite de la ventana cada segundo.",
        "La última ventana con datos se persiste en el spool aunque el tráfico se detenga.",
      ],
    },
  },
  {
    version: "0.1.1",
    date: "11 nov 2026",
    title: "Instalación de un clic en Windows",
    summary:
      "Primer paquete operativo con binario, sumas SHA256, instalador y desinstalador para Windows, y guía de Linux reescrita.",
    highlight: "Instalador con UAC, enrolamiento y verificación de hash.",
    groups: {
      added: [
        "instalar-sc-sentinel.bat y desinstalar-sc-sentinel.bat.",
        "package-release.ps1 para Windows x64 y Linux x64.",
        "Workflow de release con artefactos y SHA256SUMS.",
      ],
      fixed: [
        "El instalador verifica el SHA256 antes de reemplazar el binario.",
        "SHA256SUMS.txt se escribe sin BOM para que sha256sum -c funcione en Linux.",
      ],
    },
  },
  {
    version: "0.1.0",
    date: "11 nov 2026",
    title: "Primer release funcional",
    summary:
      "Agente con captura y colector NetFlow/IPFIX, dashboard completo, IA multi-proveedor, exports, Trust Pages y servicio Windows.",
    highlight: "Base operativa de la versión 0.1.x.",
    groups: {
      added: [
        "Cadena IA Gemini → OpenRouter → Groq con fallback y presupuesto diario.",
        "Dashboard con overview, hosts, conexiones, alertas, evals, exports y Trust Pages.",
        "Chatbot con RAG agregado de 24 h, streaming SSE e historial.",
        "Colector NetFlow v5/v9 e IPFIX integrado en el agente.",
        "Servicio Windows SC-Sentinel-Agent con recovery y logging a archivo.",
      ],
      security: [
        "Rotación de tokens de device desde el dashboard.",
        "Aislamiento por device en RAG, historial y borrado.",
        "Contexto del chatbot saneado y validación de grounding.",
      ],
    },
  },
];
