# Decisiones de arquitectura (ADRs)

Los ADRs viven en `docs/adr/` (0001–0014) y siguen el formato MADR. Este directorio es un atajo para la estructura propuesta por el framework C4/Diátaxis; **no duplicar** los archivos.

- Índice: `docs/adr/` + `docs/README.md` (mapa).
- Nuevo ADR = número siguiente (0015, 0016…), formato `NNNN-nombre-kebab.md`.
- Los ADRs no se editan retroactivamente salvo aclaración con nota.

ADRs relevantes para los diagramas nuevos:
- `0004-swr-instead-of-websockets.md` — SSE/SWR vs WebSockets (auth-sequence, C4).
- `0005-ai-batch-only.md` — IA asistente, heurística cloud (risk-score).
- `0007-single-device-v1.md` — single-device (multi-tenant-future).
- `0010-enrollment-dashboard-manual.md` — enrolamiento manual (auth-sequence).
- `0014-collector-ipfix.md` — colector IPFIX (data-flow).