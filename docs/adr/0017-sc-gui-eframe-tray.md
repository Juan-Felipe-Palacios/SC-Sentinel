# ADR-0017 — `sc-gui`: eframe 0.27, bandeja y ciclo de vida de la ventana

- Estado: aceptada (2026-11-12)
- Contexto: M5 §19. GUI opcional, separada del servicio, que corre como usuario
  normal y no debe poder cerrar el agente por accidente.

## Decisiones

### 1. MSRV de `sc-gui`: 1.76 (el agente sigue en 1.75)

El workspace fija `rust-version = "1.75"`. `eframe` 0.27 (stack aprobado) exige
1.76, así que el crate declara su propio `rust-version = "1.76"` en lugar de
heredarlo. No se sube el MSRV del agente: `sc-gui` es un binario de escritorio
que se compila en el mismo pipeline de release, no una dependencia del daemon.

### 2. La [×] oculta, "Salir" cierra

`eframe` permite interceptar el cierre del viewport. La política vive en
`actions::close_action(quitting)` (función pura, probada):

- `quitting == false` → `ViewportCommand::CancelClose` + `Visible(false)`: la
  ventana desaparece y el icono sigue en la bandeja.
- `quitting == true` (solo desde el menú **Salir**) → se deja cerrar y el
  proceso termina con el `Drop` del `TrayIcon`, que retira el icono.

Sin esa distinción, cerrar la ventana dejaba el icono huérfano en la bandeja de
Windows hasta reiniciar el explorador.

### 3. Bandeja: creación en el hilo principal y sondeo por frame

`tray-icon` crea una ventana oculta Win32; se instancia en `GuiApp::new`, es
decir en el hilo del bucle de eventos de `winit`, que es quien bombea sus
mensajes. Los eventos se consumen sin bloquear con `MenuEvent::receiver()` y
`TrayIconEvent::receiver()` en cada frame (`request_repaint_after(250 ms)`), así
que la GUI no se queda dormida esperando input del usuario.

El doble clic no existe como evento en `tray-icon` 0.15: se detecta comparando
dos `MouseButtonState::Up` del botón izquierdo dentro de 500 ms
(`actions::is_double_click`, probado). Un clic suelto no hace nada.

### 4. Icono generado en código, no un asset

`tray::icon_rgba` dibuja el disco de 32×32 píxeles (borde cian, relleno del
fondo oscuro) y sus overlays ámbar/rojo. Evita versionar binarios, permite
cambiar el color sin regenerar el `.ico` y se prueba con asserts sobre el
`Vec<u8>` RGBA.

### 5. Overlay derivado de hechos tipados

`actions::overlay_for(TrayFacts)` decide el color: rojo si el SCM no está en
RUNNING **o** el agente no responde; ámbar si la captura está degradada o el
spool supera 100 MB; normal en el resto. `capture_ok` lo calcula la capa que
tiene los datos (F3), porque en modo collector-only `capture_status` es
`disabled` y eso **no** es una degradación. `set_icon` solo se llama cuando el
overlay cambia: recrear el `HICON` en cada frame era un desperdicio.

### 6. El error de bandeja no es fatal

Si `TrayIconBuilder::build()` falla (shell sin explorer, sesión remota rara), la
GUI arranca igual con la ventana y avisa por `stderr`; se pierde la bandeja,
no la aplicación.

## Consecuencias

- La GUI no necesita privilegios; solo el enrolamiento (F4) pedirá UAC.
- Cerrar siempre deja el agente corriendo: el servicio es independiente del
  proceso de la GUI.
- Las licencias nuevas del árbol (`BSL-1.0`, `OFL-1.1`, `LicenseRef-UFL-1.0`,
  `MPL-2.0`, `Apache-2.0 WITH LLVM-exception`) están explícitas en `deny.toml`
  y atribuidas en `docs/legal/THIRD_PARTY_NOTICES.md`.
