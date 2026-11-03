# ADR-0001 — Monorepo con workspaces separados (agent/ + web/ + docs/)

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §4

## Contexto

SC-Sentinel tiene dos superficies con stacks radicalmente distintos: un agente local en Rust y una nube web en Next.js 15/Vercel. Hay que decidir si viven en uno o varios repositorios y cómo se organiza el árbol.

## Decisión

Monorepo único `SC-Sentinel` con workspaces independientes en la raíz:

```text
agent/   # workspace Cargo (crates sc-*)
web/     # Next.js 15 + TypeScript + pnpm
docs/    # specs, adr, contracts, diagrams, runbooks, testing, ux, legal, release
```

Cada workspace CI propio (`.github/workflows/rust.yml`, `web.yml`, `contracts.yml`). Los contratos JSON en `docs/contracts/` son el punto de encuentro verificable entre ambos lados (zod ↔ serde).

## Alternativas consideradas

- **Dos repos** (`sc-sentinel-agent`, `sc-sentinel-web`): separa PRs que rompen ambos lados de un mismo contrato; duplica configuración de CI y issues. Descartado para v1 (equipo de 1 persona).
- **Fork in place de Sniffnet**: acopla la historia git de un proyecto ajeno a un producto propietario con identidades distintas. Descartado (ver ADR-0006).

## Consecuencias

- Un solo historial de issues/releases; SUS tags cubren agente y web (SemVer compartido, ver `release/versioning.md`).
- Cambios de contrato obligan a tocar `docs/contracts/` + agente + web en el mismo PR: trazabilidad garantizada.
- CI condicionado por rutas (`paths:`) para no correr jobs innecesarios.
