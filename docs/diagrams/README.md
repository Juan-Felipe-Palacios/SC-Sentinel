# Diagramas — índice

**Convención:** los `.mmd` son fuentes mermaid (render en GitHub/markdown nativo y https://mermaid.live). Los `.drawio` editables en https://app.diagrams.net (draw.io / VS Code extension). Los `.svg/.pdf` de `exports/` se generan de los anteriores al momento de necesitarlos (no se guardan binarios en git).

Fuente de verdad del contenido: `docs/specs/SC-Sentinel-Spec-Completo-2026-11-03.md`.

## mermaid/

| Archivo | Prioridad (spec §17.1) | Qué documenta |
|---|---|---|
| `system-context.mmd` | Alta — antes de M1 | C4 Context: admin, agente local, Vercel, Neon, cadena IA (Gemini/OpenRouter/Groq) |
| `agent-components.mmd` | Alta — antes de M1 | Wraps del agente (sc-core…sc-sync) y sus aristas canales mpsc |
| `ingest-sequence.mmd` | Alta — antes de M1 | Secuencia completa POST /api/ingest: auth → descompresión → zod → ON CONFLICT → 200 processed/duplicate |
| `sync-state-machine.mmd` | Alta — antes de M1 | Estados de sc-sync: Idle/Sending/Backoff/NeedsEnrollment/DeadLetter/SpoolFull |
| `database-erd.mmd` | Alta — antes de M1 | ERD de las 7 tablas (§6) |
| `ai-cron-sequence.mmd` | Media — antes de M3 | Gate 15 min + datos nuevos, dedup facts_hash, cadena multi-proveedor, backoff 5xx, degraded |
| `alert-lifecycle.mmd` | Media — antes de M3 | Estados de alerta: open → acknowledged → resolved + retención 30 d |

## drawio/

| Archivo | Prioridad | Qué documenta |
|---|---|---|
| `deployment-vercel-neon.drawio` | Alta — antes de M1 | Deployment Vercel (landing/dashboard/api) + Neon + cadena IA free (Gemini/OpenRouter/Groq) |
| `network-topology-pcap.drawio` | Alta — antes de M1 | Topología de captura pcap: NIC → Npcap → sc-capture → aggregate → sync |
| `network-topology-ipfix.drawio` | Media — antes de M4 | Topología M4: MikroTik IPFIX / Cisco NetFlow → sc-collector (diferencias pcap vs flow) |
| `windows-service-layout.drawio` | Media — antes de M5 | Rutas y layout del servicio Windows (SCM, Program Files, ProgramData, token env) |

## exports/

Generar bajo demanda desde los fuentes (`.mmd` vía mermaid-cli `mmdc`; `.drawio` vía export de la app). **Regla:** si un export entra en un documento publicado en producción, re-generarlo del fuente congelado — no editar el export a mano.
