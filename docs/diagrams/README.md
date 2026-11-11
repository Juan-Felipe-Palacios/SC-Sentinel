# Diagramas — índice

**Convención:** los `.mmd` son fuentes mermaid (render en GitHub/markdown nativo y https://mermaid.live). Los `.drawio` editables en https://app.diagrams.net (draw.io / VS Code extension). Los `.svg/.pdf` de `exports/` se generan de los anteriores al momento de necesitarlos (no se guardan binarios en git).

Fuente de verdad del contenido: `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md`.

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
| `c4-containers.mmd` | Alta — visual docs | C4 Level 2: contenedores (sc-agent, Vercel, Neon, IA) |
| `ingest-data-flow.mmd` | Alta — visual docs | DFD nivel 1 del pipeline de ingest con latencias y ⚠️ heurística cloud |
| `auth-sequence.mmd` | Alta — visual docs | Secuencia admin/guest + rotación de token de device (M7) |
| `risk-score-calculation.mmd` | Media — visual docs | Cómo se calcula risk_score (determinista + heurística cloud) |
| `deployment.mmd` | Media — visual docs | Despliegue GitHub Actions → Vercel + Neon + agente |

## drawio/

| Archivo | Prioridad | Qué documenta |
|---|---|---|
| `deployment-vercel-neon.drawio` | Alta — antes de M1 | Deployment Vercel (landing/dashboard/api) + Neon + cadena IA free (Gemini/OpenRouter/Groq) |
| `network-topology-pcap.drawio` | Alta — antes de M1 | Topología de captura pcap: NIC → Npcap → sc-capture → aggregate → sync |
| `network-topology-ipfix.drawio` | Media — actualizada 2026-11-08 (M4) | Topología M4 real: MikroTik IPFIX / Cisco NetFlow → sc-collector (bind 0.0.0.0, auto) → normalizer → merge con pcap → aggregate → spool → /api/ingest; limitaciones y ref a `testing/pcap-vs-flow.md` |
| `windows-service-layout.drawio` | Media — antes de M5 | Rutas y layout del servicio Windows (SCM, Program Files, ProgramData, token env) |

## exports/

Generar bajo demanda desde los fuentes (`.mmd` vía mermaid-cli `mmdc`; `.drawio` vía export de la app). **Regla:** si un export entra en un documento publicado en producción, re-generarlo del fuente congelado — no editar el export a mano.

**Atlas vectorial (A4):** `docs/atlas.pdf` (documentación completa + diagramas SVG embebidos, 283 páginas) y `docs/diagrams/exports/*.dxf` (un DXF por diagrama, geometría vectorial CAD). Conversión SVG→DXF: `scripts/svg2dxf.py` (svgpathtools + ezdxf).

## Checklist de calidad visual (cada diagrama)

- Self-contained: se entiende sin leer el texto.
- Versionable: está en código (Mermaid/D2), no PNG.
- Actualizable: si cambio el código, ¿puedo actualizar el diagrama en 5 min?
- Nivel correcto: no mezcla detalles de implementación con arquitectura.
- Fecha y autor: quién lo hizo, cuándo, para qué versión (en el PR).
- Leyenda: símbolos explicados.
- Accesible: descripción textual alternativa (el `.md` que lo acompaña).

## Automatización (docs que no mueren)

```bash
# Grafo de dependencias Rust
cd agent && cargo tree --format "{p}" | dot -Tsvg > ../docs/diagrams/exports/deps.svg

# ERD desde el schema SQL (Neon)
pg_dump --schema-only "$DATABASE_URL" | npx pg-erd > docs/diagrams/exports/schema.mmd

# Diagramas Mermaid a SVG/PNG
npx -y @mermaid-js/mermaid-cli -i docs/diagrams/mermaid/system-context.mmd -o docs/diagrams/exports/system-context.svg
```

Los exports generados no se versionan (`.gitignore`); se regeneran del fuente al publicar.
