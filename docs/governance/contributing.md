# Gobernanza — contribución

## Flujo

1. Crear rama desde `main` (`feat/...`, `fix/...`, `docs/...`).
2. Commits convencionales (`feat:`, `fix:`, `docs:`, `chore:`).
3. PR con descripción, tests y checklist.
4. CI verde (cargo test/clippy, pnpm typecheck/lint/test/build, contracts).
5. Revisión y merge.

## Reglas (docs/README.md)

- Cambio de contrato = spec + contracts + zod↔serde + fixtures en el mismo PR.
- Decisión nueva = ADR con número siguiente.
- Cambio de retención/sizing/tokens = actualizar spec + docs hijos.
- Idioma: español internacional profesional.

## Estilo

- Código: Rust (rustfmt), TypeScript (eslint config del proyecto).
- Documentación: Markdown, diagramas en Mermaid/D2 (no binarios).
- Tests obligatorios para lógica nueva.

## Seguridad

- No commitear `.env*` ni secretos. Reportar vulnerabilidades por canal privado.