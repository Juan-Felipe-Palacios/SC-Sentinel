# ADR-0002 — Agente en Rust + tokio, con tipos de dominio en sc-core

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §4, §16.2

## Contexto

El agente debe capturar tráfico con pcap (herencia de Sniffnet: etherparse, tablas de ~6000 servicios, MaxMind) y ejecutarse como daemon headless (Windows service / systemd). La lógica original de Sniffnet está acoplada a iced (GUI).

## Decisión

- Runtime: **tokio** como core async; captura en thread bloqueante puenteada a eventos `tokio mpsc` (canal bounds 10.000 → backpressure, spec §8.2).
- Workspace de crates con jerarquía de dependencias estricta:

```text
sc-core      (tipos: FlowKey, HostStats, Alert, WindowSnapshot — sin deps de runtime)
sc-capture / sc-collector / sc-geo  (fuentes) → sc-aggregate → sc-detect → sc-sync
sc-config / sc-telemetry (transversales)
sc-agent (bin daemon) y sc-gui (bin iced, M5) consumen las anteriores
```

- La GUI iced queda separada del engine desde el día 1: el daemon no depende de iced; el binario GUI consume los mismos crates.

## Alternativas consideradas

- **Port completo del monolito Sniffnet**: mantiene el acople iced; contradice el requisito de daemon headless. Descartado.
- **Go/Python**: perdería reutilización directa (~90% de capture.rs, ~95% de ipfix/). Descartado.

## Consecuencias

- El único refactor difícil es el puente iced→tokio en `sc-capture`; planificado y acotado (spec §4.1).
- `sc-core` es estable por contrato: tipos versionados con el schema de snapshot (`v: 1`).
- Backpressure explícito: si el canal se llena, se descartan paquetes y se incrementa `packets_dropped` (nunca bloqueo silencioso).
