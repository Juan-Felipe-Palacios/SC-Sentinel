#!/usr/bin/env bash
# Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
# Gate local anti-drift de contratos: Rust ↔ fixture ↔ Zod.
# Falla si un campo nuevo en Rust no está en el fixture, o si el fixture
# deja de validar contra los esquemas Zod del servidor.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Rust: fixture normativo (deserializa y serializa idéntico)"
(cd "$ROOT/agent" && cargo test -p sc-core ejemplo_del_contrato)

echo "==> JSON Schemas: ejemplos válidos e inválidos"
node "$ROOT/scripts/validate-contracts.js"

echo "==> Zod: contrato de ingest en el servidor"
(cd "$ROOT/web" && pnpm test:contracts)

echo "Contratos OK (Rust + JSON Schema + Zod)."
