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
# pnpm >= 10 verifica que node_modules coincida con el lockfile antes de correr
# un script y aborta con ERR_PNPM_VERIFY_DEPS_BEFORE_RUN (el campo `pnpm` de
# web/package.json ya no se lee). `--config.verify-deps-before-run=false` salta
# esa verificación previa; el test que se ejecuta es el mismo. Si el pnpm
# instalado no ejecutó los tests, se corren con node directo: un fallo real del
# test vuelve a fallar ahí y el gate no se pone verde.
if ! (cd "$ROOT/web" && pnpm --config.verify-deps-before-run=false test:contracts); then
  echo "==> pnpm no ejecutó test:contracts; se corre el test con node" >&2
  (cd "$ROOT/web" && node --experimental-strip-types ../scripts/test-contracts-zod.mjs)
fi

echo "Contratos OK (Rust + JSON Schema + Zod)."
