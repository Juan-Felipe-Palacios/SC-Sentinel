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

### 7.2 Aparece un `spool/` en la raíz del repo

**Síntoma:** tras arrancar el agente sin `--config` aparece
`D:\ProyectosWeb\SC-Sentinel\spool\sc-spool.sqlite` (y su `-wal`/`-shm`).

**Causa:** sin `--config`, el agente usa `DEFAULT_SPOOL_PATH = "./spool/sc-spool.sqlite"`
y `DEFAULT_HMAC_KEY_FILE = "./config/.host-key"`, que son **relativos al
directorio de trabajo**, no al directorio del `config.toml`. Si lanzas el agente
desde la raíz del repo, el spool se crea ahí.

**Regla:** para desarrollo, **pasa siempre `--config`** (por ejemplo
`--config agent/config/sc-agent.toml`); las rutas de ese fichero se resuelven
contra el directorio del propio `config.toml` (`./.host-key` →
`agent/config/.host-key`, `../spool/sc-spool.sqlite` → `agent/spool/`). Y cuando
arranques el agente desde la raíz del repo, no reutilices la ruta por defecto.

**Si ya existe un spool así:** sus batches pertenecen a la sesión que lo creó.
Comprueba el dispositivo y la versión antes de tirarlo:

```bash
sqlite3 spool/sc-spool.sqlite \
  "SELECT COUNT(*) FROM batches;
   SELECT json_extract(payload,'\$.device.id') FROM batches LIMIT 1;"
```

Si son datos de evaluación y no de producción, **archívalos fuera del repo**
(comprimidos, con su `README` y el SHA256) y borra el original; no los arrastres
en el árbol de trabajo, porque el repo solo los ignora mientras el nombre siga
siendo `*.sqlite`.

> Nota: en Windows, `sqlite3` puede no estar instalado. Con Python:
> `python -c "import sqlite3;print(sqlite3.connect('spool/sc-spool.sqlite').execute('SELECT COUNT(*) FROM batches').fetchone())"`.

### 7.3 Un script PowerShell falla en runtime aunque el parser diga 0 errores

**Síntoma:** un `.ps1` que valida sintaxis no da ningún error, pero al ejecutarlo
aparece en medio de la salida:

```
else: C:\...\script.ps1:251
Line |
 251 |   } else {
     |   ~~~~
     | El término "else" no se reconoce como nombre de un cmdlet.
```

**Causa:** hay **dos `else` para el mismo `if`**. El segundo `else` se queda
colgado y, al no pertenecer a ningún `if`, PowerShell lo interpreta como un
**comando** (un *bareword*) en vez de como palabra clave.

**Por qué el parser no lo detecta:** `[System.Management.Automation.Language.Parser]::ParseFile`
**sí lo acepta**, porque `else` es un nombre de cmdlet perfectamente válido en
la posición de comando. Es decir: **una estructura `if/else` rota es un error
de RUNTIME, no de sintaxis**, y la validación sintáctica da un falso "todo bien".

**Cómo evitarlo:**

1. Ejecuta el script entero, no solo la validación sintáctica: es el único
   que detecta el `else` huérfano.
2. Si aparece este error, mira el `if` al que debería pertenecer el `else` y
   comprueba que no haya otro `else` antes en el mismo bloque. Un patrón que
   lo evita es **inicializar la variable antes del `if`** y no usar un `else`
   para el caso "no aplica":

   ```powershell
   # en vez de:
   if ($svc) { ... } else { $flag = $false }

   # mejor:
   $flag = $false          # valor por defecto antes del if
   if ($svc) { $flag = $true }
   ```

3. Alternativa de comprobación estática: contar los `if`/`else` por bloque, o
   apoyarse en un formateador/linter de PSScriptAnalyzer (`PSScriptAnalyzer`
   reporta `PossibleIncorrectComparisonWithNull` y similares, pero **no** este
   caso: sigue haciendo falta ejecutar).

### 7.4 Un comando elevado largo falla con «never reported back»

**Regla:** los comandos elevados largos (UAC, SCM, registro) van en un `.ps1`
en disco y se lanzan con `Start-Process -Verb RunAs -Wait`; la salida se
redirige a un log y el código de salida a un fichero. En línea, las comillas y
redirecciones anidadas hacen que el wrapper no devuelva nunca el resultado.

## 8. Desplegar el agente con rollback

Cada vez que reemplazas el `.exe` del servicio usa
`scripts\deploy-agent-service.ps1` en lugar de copiar a mano: hace respaldo,
para el servicio con drenaje verificado, comprueba el SHA de lo copiado y no
dice «OK» hasta que el log muestra un `sync_confirmed` **posterior** al arranque.

### 8.1 Comandos

Desde una consola **elevada** (Administrador), con el `.ps1` en disco —los
comandos elevados largos escritos en línea fallan con «never reported back»
(§7.4):

```powershell
# 1. Compilar y desplegar
cd agent; cargo build --release -p sc-agent --features sc-capture/live; cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1

# 2. Volver al binario anterior (el .bak del ultimo Deploy)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1 -Mode Rollback

# 3. Volver adelante tras un rollback
#    (el .new que guardo el Deploy, o el .new-<marca> que guarda el Rollback)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1 `
    -Mode Deploy -Source "$env:TEMP\sc-rollback-agent\sc-sentinel-agent.exe.new"

# 4. Ver el plan sin tocar el servicio (no necesita elevacion)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1 -DryRun
```

Parámetros: `-Source` (binario nuevo), `-Target` (instalado), `-Service`,
`-BackupDir` (`%TEMP%\sc-rollback-agent`), `-LogPath` (`agent.log`) y los topes
`-StopTimeoutSec` / `-StartTimeoutSec` / `-SyncTimeoutSec`.

### 8.2 Qué esperar

| Paso | Salida esperada |
| --- | --- |
| respaldo | `respaldo : …\sc-sentinel-agent.exe.bak (sha=…)` y su `.sha256` al lado |
| parada | `sc stop` → `Stopped` antes de `-StopTimeoutSec` |
| drenaje | línea del log `event="spool_flushed" pending=0` |
| copia | SHA del archivo copiado igual al destino; si no, no se arranca |
| arranque | `Running` antes de `-StartTimeoutSec` |
| sync | `sync_confirmed` con marca de tiempo posterior al arranque |
| cierre | `OK: Deploy completado` (o `Rollback`) |

`Deploy` con el mismo SHA que el instalado **no hace nada**: avisa «nada que
desplegar» y sale con código 0 sin parar el servicio.

El respaldo se firma: cada `Deploy` deja `sc-sentinel-agent.exe.bak.sha256`
junto al `.bak`, y `Rollback` compara ambos **antes de copiar**. Un `.bak` creado
a mano (sin su `.sha256`) no se restaura: aborta con código 21. Un `.bak` que no
coincide con su `.sha256` aborta con 22.

`Rollback` guarda el binario que va a reemplazar como
`sc-sentinel-agent.exe.new-<marca>` (nunca pisa el `.new` del último `Deploy`),
así que la vuelta adelante es `-Mode Deploy -Source` apuntando a esa copia: el
propio script imprime el comando exacto si no consigue arrancar.

`-DryRun` imprime el inventario (SHA y tamaño del instalado, del origen y del
respaldo, más si el log es legible), el plan paso a paso y **qué aborto se
dispararía**, sin tocar el servicio. Sale con 0 si la ejecución real puede
proceder y con 20 si abortaría antes de tocar nada.

`-Source` no puede ser el propio `.bak` ni el `.new` de la carpeta de respaldo
(aborta con 25): el `Deploy` los rota y usarlos como origen confunde respaldo
con binario nuevo. Compila el `.exe` o apunta a una copia fuera de esa carpeta.

Si el servicio no arranca después de copiar, el script **no reintenta solo**:
imprime `binario nuevo instalado, servicio detenido`, el SHA que quedó y el
comando exacto de rollback. Ejecútalo tú tras mirar el log.

### 8.3 Verificar después

```bash
curl -s http://127.0.0.1:8387/status | head -c 400   # uptime_seconds, interface, windows
# SHA del instalado == SHA del origen que compilaste
powershell -NoProfile -Command "(Get-FileHash 'C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe' -Algorithm SHA256).Hash"
```

Y en la GUI (`scripts\abrir-gui.bat`): Estado con Uptime e Interfaz, último sync
reciente y spool en 0 B; Stats con las ventanas llegando.

Rollback comprobado de ida y vuelta: el `.bak` restaura un agente que no manda
`uptime_seconds`/`interface`/`windows` y la GUI los muestra como `—`.

