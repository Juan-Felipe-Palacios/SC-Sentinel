# Runbook — Desarrollo local (M0+)

**Requisitos:** Rust toolchain stable (rustup) · Node 20+ · pnpm 9+ · Git · Windows (dev principal) o Linux.

## 1. Estructura

```text
D:\ProyectosWeb\SC-Sentinel\   # monorepo (ADR-0001)
├── agent/     # workspace Cargo (crates sc-*)
├── web/       # Next.js 15 (pnpm)
└── docs/      # specs, adr, contracts, diagrams, runbooks, testing, ux, legal, release
```

## 2. Clonar y compilar

```bash
git clone <url-repo> SC-Sentinel && cd SC-Sentinel

# Agente (Rust)
cd agent
cargo build
cargo test

# Web (Next.js)
cd ../web
pnpm install
pnpm dev            # http://localhost:3000
```

## 3. Flujo de prueba end-to-end sin nube (mock)

Durante M1, `sc-agent` publica a un mock server HTTP local en lugar de Vercel:

```toml
# agent/config.dev.toml
[agent]
endpoint = "http://localhost:8787/api/ingest"
window_seconds = 30
compression = "gzip"
```

```bash
cargo run -p sc-agent -- --config config.dev.toml
```

El mock server valida el esquema y escribe payloads a disco para inspección (ver `testing/fixtures.md`).

## 4. Validación de contratos

Los contratos en `docs/contracts/` se validan en CI (`contracts.yml`) y a mano:

```bash
node scripts/validate-contracts.js   # script del M0; valida schemas + ejemplos
```

Regla: un PR que cambia un contrato debe modificar el agente, la web, el schema y los ejemplos en el mismo PR (ADR-0001).

## 5. Práctica diaria (gates)

- Agente: `cargo fmt --check && cargo clippy -- -D warnings && cargo test`.
- Web: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Datos de desarrollo contra Neon usan **preview branch**, nunca main (ADR-0003).
- La GUI (`sc-gui`) no es prerequisito: cada crate compila y se prueba por separado.

## 6. Tareas rápidas

| Tarea | Comando |
|---|---|
| Test de un crate | `cargo test -p sc-aggregate` |
| Correr daemon | `cargo run -p sc-agent -- --config <path>` |
| Revisar snapshots insta | `cargo insta review` |
| Playwright (requiere web corriendo) | `pnpm playwright test` |

## 7. Errores típicos

| Síntoma | Causa | Solución |
|---|---|---|
| `pcap` no compila en Windows | Falta Npcap SDK | Instalar Npcap + SDK (ver `troubleshoot-pcap.md`) |
| 401 en mock/server | Token no configurado | Export export `SC_INGEST_TOKEN` antes de correr |
| Snapshot diverge | Cambio de contrato sin fixtures | Regenerar golden files y revisar diff manualmente |

### 7.1 Un test falla pero el código en disco es correcto: `mtime` mentiroso

**Síntoma:** un test falla con un valor esperado que *sí* está en el fichero
(fichero correcto en disco y en `HEAD`, `git diff` limpio), y el mensaje de
error apunta a una línea antigua.

**Causa:** Cargo decide si recompila comparando el **mtime** del fuente con el
del artefacto compilado. Una **restauración textual** del fichero (un `git
checkout` de otra rama, un revert, un split de commit con copia de ficheros)
puede dejar el `mtime` **más antiguo** que el del binario de test ya
compilado. Cargo lo da por fresco y **no recompila**: se ejecuta el binario
viejo con los asserts viejos, y el fallo parece un error de código cuando no
lo es.

```text
# Falso positivo: el binario de test se compiló a las 10:54:09
# y el fuente (restaurado a las 10:18:54) parece más viejo.
left: "../spool/sc-spool.sqlite"
right: "./spool/sc-spool.sqlite"
```

**Regla:** ante un fallo de test inesperado **con el código correcto en disco
y en `HEAD`**, no depures el código todavía: fuerza la recompilación primero.

```bash
# Solo los crates tocados (rápido):
cargo clean -p sc-config -p sc-geo -p sc-agent
cargo test --workspace

# O, si hay dudas sobre el estado del árbol de trabajo:
cargo clean          # borra todo target/ (varios GiB)
```

**Cómo se evita:** al restaurar o copiar ficheros por encima de otros
(`Copy-Item`, `shutil.copy2`, `git checkout <otra-rama> -- <path>`), comprobar
que el `mtime` queda por delante del artefacto compilado, o forzar el
`cargo clean -p` del crate afectado antes de volver a pasar los gates.

