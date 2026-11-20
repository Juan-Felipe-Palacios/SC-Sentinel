# ADR-0020 — Se ignora RUSTSEC-2026-0257 hasta actualizar el stack de la GUI

**Fecha:** 2026-11-20 · **Estado:** Aceptada · **Relacionadas:** ADR-0017 (`sc-gui`: eframe 0.27), gate `cargo audit` de `.github/workflows/rust.yml`

## Contexto

El gate `cargo audit` del CI de Rust nunca llegó a ejecutarse. Desde `v0.1.6` la corrida moría antes, compilando `glib-sys` en `ubuntu-latest` y, por el `fail-fast`, cancelando el job de Windows (arreglado el 2026-11-20 en `rust.yml` y en `sc-gui/src/actions.rs`). Al restaurarlo, el gate falló en las dos plataformas con:

```
error: 1 vulnerability found!
warning: 6 allowed warnings found
```

La única vulnerabilidad es **RUSTSEC-2026-0257** (`webbrowser`), de tipo *format-injection* en Unix: el crate sustituye la URL del llamador dentro de la plantilla de la variable de entorno `BROWSER` antes de tokenizarla, de modo que una URL no HTTP(S) que conserve espacios puede aportar argumentos extra al navegador. El aviso lo reprodujo con `--remote-debugging-port` (endpoint local de DevTools expuesto) y `--proxy-server` (tráfico desviado por un proxy del atacante). Afecta a `open`, `open_browser` y `open_browser_with_options` en `<= 1.2.1`.

La dependencia entra por `egui-winit 0.27.2` → `eframe 0.27.2` → `sc-gui` (verificado con `cargo tree -i webbrowser`: una sola versión, `webbrowser v0.8.15`), que es el stack fijado por ADR-0017. `egui-winit 0.27` exige `webbrowser ^0.8` y el parche (`>= 1.2.2`) sólo existe en la rama 1.x, así que `cargo update -p webbrowser` no puede resolver una versión arreglada.

## Decisión

1. El gate pasa a `cargo audit --ignore RUSTSEC-2026-0257`, **y sólo ese identificador**. Cualquier otra vulnerabilidad sigue rompiendo el CI.
2. El motivo queda junto al comando en `.github/workflows/rust.yml`; esta ADR lo respalda.
3. La excepción se apoya en dos hechos medidos, no en una suposición:
   - **La ruta afectada no se invoca:** `grep -rniE "open_url|webbrowser|Hyperlink|Link::new|open_in_browser" agent/crates/sc-gui/src` no devuelve coincidencias.
   - **El código afectado es sólo Unix** (la sustitución vive en `src/unix.rs` de `webbrowser`, según el propio aviso), mientras `sc-gui` se distribuye únicamente para Windows: el paquete de Linux se publica como colector, sin GUI.

## Disparador para revisar esta decisión

Se levanta el ignore —y se actualiza esta ADR— cuando el grafo deje de resolver `webbrowser 0.8.x`. La comprobación es un comando, no una fecha:

```bash
cd agent && cargo tree -i webbrowser
```

- Si imprime `webbrowser v0.8.x`, el ignore sigue vigente.
- Si imprime `webbrowser v1.2.2` o superior, quitar `--ignore RUSTSEC-2026-0257` de `rust.yml` **en el mismo cambio** que actualice `eframe`/`egui-winit`.

**Cualquier actualización de `eframe` o de `egui-winit` dispara esta revisión**, porque son los que arrastran `webbrowser`. Hoy `eframe` está fijado en 0.27 por ADR-0017, de modo que esa actualización futura incluye, como paso obligatorio, volver a correr `cargo audit` sin el ignore y confirmar la versión de `webbrowser`.

## Alternativas consideradas

- **Subir `eframe`/`egui` ahora** para llegar a `webbrowser >= 1.2.2`: es la solución de fondo, pero obliga a migrar el stack completo de la GUI (API de `eframe` 0.27, `tray-icon`, `winit`), revisar ADR-0017 y volver a validar la GUI en Windows. Descartado para un cambio de CI; queda como trabajo propio.
- **`[patch.crates-io]` apuntando a `webbrowser 1.x`**: cargo rechaza el parche porque `egui-winit 0.27` exige `^0.8`; la 0.8.15 seguiría en el grafo.
- **Dejar el CI en rojo**: el gate no volvería a ejecutarse y perdería su valor como red de seguridad sobre el resto del árbol.
- **Silenciar además los 6 avisos** (`glib` *unsound*, `proc-macro-error`, `ttf-parser`, `instant`, `chrono`, `backoff`): innecesario. `cargo audit` no falla por avisos y siguen imprimiéndose en el log de cada corrida.

## Consecuencias

- El CI de Rust vuelve a validar `fmt`, `clippy`, `test`, la feature `live`, `audit`, `deny` y el build en ambas plataformas (run `44666802816` sobre `4d7bbbd`, verde: 18 pasos en Windows y 17 en Linux, sin fallos).
- Queda una deuda explícita con condición de salida verificable: al subir `eframe`, el primer paso es quitar el ignore y comprobar `cargo tree -i webbrowser`.
- Los 6 avisos permitidos siguen visibles en el log; si alguno pasa a vulnerabilidad, el gate falla solo.
