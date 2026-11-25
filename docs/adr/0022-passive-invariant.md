# ADR-0022 — Invariante pasivo del sensor OT

- **Estado**: aceptado (decisión de diseño; enforcement pendiente de E4/E5/E10)
- **Fecha**: 2026-11-25
- **Relacionadas**: ADR-0007 (un solo dispositivo), ADR-0021 (retención de
  `ot_assets`)
- **Contexto de código**: `agent/crates/sc-capture/src/`,
  `agent/crates/sc-ot/` (nuevo, E4), `scripts/verify-passive.sh` (nuevo, E10),
  `ci/passive-allowlist.txt` (nuevo, E10)

## Contexto

SC-Sentinel observa tráfico OT de forma **estrictamente pasiva**: captura por SPAN
o TAP, nunca responde, nunca hace handshake y nunca escanea (AGENTS.md §10.1). M6
extiende la captura a Modbus TCP, S7comm, DNP3 e IEC 60870-5-104, donde un paquete
activo accidental no es un error cosmético: puede alterar un PLC o una estación
remota.

La librería `pcap` expone `Capture::sendpacket`, y libpcap tiene capacidad de
envío. El diseño no puede depender de que nadie llame a esa función: necesita una
barrera que haga imposible compilar el envío y que falle en CI si alguien
introduce un socket o una dependencia de red.

Estado medido el 2026-11-25: `sc-capture/src` tiene **0** apariciones de `unsafe`
y **0** de `sendpacket`; `sc-ot` todavía no existe. El atributo
`#![forbid(unsafe_code)]` aún no está aplicado en `sc-capture`; se agrega en E5.

## Decisión

El sensor OT mantiene estos invariantes, cada uno con su capa de enforcement:

| Invariante | Enforcement | Etapa |
|---|---|---|
| `sc-ot` no contiene código `unsafe` | `#![forbid(unsafe_code)]` | E4 |
| `sc-capture` no contiene código `unsafe` | `#![forbid(unsafe_code)]` + revisión | E5 |
| No se crean sockets ni se conecta | clippy `disallowed-types`: `TcpStream`, `UdpSocket`, `socket2::Socket`; `disallowed-methods`: `connect`, `send_to`, `pcap::Capture::sendpacket`, `libc::send/sendto/sendmsg/connect` | E5 |
| No se incorporan dependencias de red | test del grafo: `sc-capture`/`sc-ot` no dependen de `socket2`, `reqwest`/`hyper`/`ureq`/`axum` ni de `sc-sync`, directa o transitivamente, incluidas features | E5 |
| La captura se limita a los segmentos OT declarados | BPF por defecto derivado de `ot_segment_cidrs`; sin CIDR configurado no se captura, no se "prueba" la red | E5 |
| Sin libpcap o sin permiso, degrada a colector | `ot_engine: "port_only"` y estado visible en `/status`; nunca se reemplaza por sondeo activo | E5 |
| El binario no puede enviar | gate de CI `scripts/verify-passive.sh` + allowlist auditada `ci/passive-allowlist.txt` | E10 |
| El único egress es el sync TLS y `/status` en loopback | allowlist de egress revisada en el gate | E10 |

Reglas de aplicación:

1. Una excepción a cualquiera de estos invariantes **requiere un ADR previo al
   merge**, no un `#[allow]`, un `--ignore` ni una exclusión de test. Si una
   versión futura de `pcap` exige `unsafe`, el ADR decide si se acepta y con qué
   compensación.
2. El gate de CI falla cerrado: una línea nueva en la allowlist se revisa como
   cambio de seguridad, no como ruido.
3. Los tests de control (por ejemplo, introducir un `TcpStream::connect` a
   propósito para comprobar que clippy lo detecta) viven en un fixture aparte y
   nunca se compilan en el binario del sensor.

## Lo que este ADR no decide

- No implementa el enforcement: eso ocurre en E4 (`sc-ot`), E5 (`sc-capture`) y
  E10 (gate de CI). El hito M6 se aprobó el 2026-11-25, pero cada etapa sigue
  necesitando un "dale" explícito (AGENTS.md §3.2).
- No adelanta seccomp por hilo, que el diseño deja para F3+.
- No decide el modo de captura por defecto del despliegue; sólo prohíbe que
  cualquier modo activo sea una opción.

## Alternativas consideradas

- **Confiar sólo en revisión de código.** Es lo que falla en la práctica: una
  llamada a `sendpacket` compila y pasa los tests. Descartada.
- **Aplicar seccomp por hilo ahora.** Es la defensa de fondo, pero requiere
  integrarse con el runtime y el arranque elevado del sensor; el diseño la ubica
  en F3. Se mantiene como hardening futuro, no como sustituto de las barreras de
  compilación.
- **Empaquetar el sensor en un contenedor sin red de salida.** Cambia el modelo de
  despliegue (servicio nativo con Npcap/libpcap) y no está en F1. Descartada para
  este milestone.
- **No capturar OT.** Contradice el objetivo del producto. Descartada.

## Consecuencias

- **Positivas:** el envío activo no es alcanzable por construcción en el código
  propio; el CI detecta regresiones de dependencias y de sockets; la degradación
  a colector es explícita y visible.
- **Negativas:** `forbid(unsafe_code)` puede bloquear una actualización futura de
  `pcap` y obligar a un ADR; el test de grafo y el gate agregan mantenimiento;
  `pcap_sendpacket` sigue existiendo en la librería y sólo es inalcanzable
  mientras se respeten estas barreras.
- **Riesgo residual:** libpcap puede enviar paquetes. La mitigación es
  compilación + clippy + grafo + gate, no una garantía del sistema operativo.
  Hasta que E5 y E10 estén cerradas, **no se puede afirmar que el sensor sea
  pasivo por construcción**; hoy sólo se midió que el código existente no usa
  `unsafe` ni `sendpacket`.

## Disparadores para revisar esta decisión

- Una versión de `pcap` exige `unsafe` o expone una API de envío no bloqueada.
- Aparece una dependencia transitiva con capacidad de red en `sc-capture`/`sc-ot`.
- El gate `scripts/verify-passive.sh` necesita una excepción nueva.
- Se implementa el artefacto `linux-x64-sensor` y cambia el modelo de privilegios.
- Se retoma el hardening de seccomp (F3).
