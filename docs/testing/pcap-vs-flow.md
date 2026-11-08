# Diferencias entre captura pcap y flujo NetFlow/IPFIX

Las ventanas del dashboard pueden alimentarse desde dos fuentes: la captura
pcap local (`sc-capture`, libpcap/Npcap) y el colector NetFlow/IPFIX
(`sc-collector`, exportaciones del router). No son intercambiables: miden cosas
distintas con distinta fidelidad. Este documento registra las diferencias para
que la evidencia de M4 se interprete correctamente.

Referencias: ADR-0014, `docs/runbooks/collector-mikrotik.md` §2 y §7,
`docs/testing/fixtures/README.md`.

## 1. Muestreo (sampling)

- **pcap**: mide el tráfico que atraviesa el interfaz. Sin sampling, cada
  paquete observado cuenta.
- **Flow**: el router puede muestrear (1 de N flujos). Un flujo muestreado
  representa N flujos reales; el colector no lo multiplica hoy: los valores de
  `bytes`/`packets` del flujo son los del registro exportado, no extrapolados.
  Los options templates de v9/IPFIX describen el sampling pero su data se
  descarta (ADR-0014), así que el sampling efectivo del router queda fuera de
  las métricas.
- **Implicación**: comparar bytes pcap vs bytes flow en el mismo segmento es
  inválido si el router tiene sampling activo. En la validación sintética y en
  el runbook se usa sampling 1:1 para que las cifras sean directamente
  comparables.

## 2. Timeouts de flujo (granularidad temporal)

- **pcap**: los eventos existen en cuanto el paquete llega; no hay espera.
- **Flow**: un flujo se exporta al cerrarse, no en vivo:
  - `active-flow-timeout` (MikroTik, recomendado 1m en el runbook): un flujo
    largo se trocea y se exporta por partes cada N segundos.
  - `inactive-flow-timeout` (default 15s): un flujo ocioso espera a expirar
    antes de exportarse; el tráfico de un flujo breve puede aparecer en el
    dashboard con retardo de hasta ese timeout.
- **Implicación**: la primera evidencia de un flujo flow llega tarde respecto
  a pcap; con el default de `active-flow-timeout=30m` de RouterOS un tráfico
  continuo puede tardar media hora en aparecer. Por eso el runbook fija 1m.

## 3. Bytes por paquete y tamaño de paquete

- **pcap**: se conoce el tamaño real de cada paquete (incluida la cabecera
  Ethernet) y se pueden derivar paquetes por flujo, tamaños medios, etc.
- **Flow**: solo existen los contadores `bytes`/`packets` del registro
  (NetFlow v5: octetos y paquetes del flujo). No hay tamaño de paquete por
  evento, ni MAC, ni información de capa 2. El registro `Nf5Record`/normalizador
  solo transporta `bytes` y `packets` hacia `FlowUpdate`.
- **Implicación**: métricas como "paquete promedio" o detección de jumbo/fragmentación
  son imposibles desde flow; salen solo de pcap.

## 4. Dirección atribuida al host

- **pcap**: la dirección se determina por el contexto de la captura (interfaz,
  subnet local conocida).
- **Flow**: el normalizador emite `Direction::In` para todos los flujos y
  atribuye el host a `src_ip` (ADR-0014 §limitación). El tráfico entrante
  hacia un host local queda atribuido al host remoto hasta que exista una
  política de redes locales (trabajo P1).
- **Implicación**: en el dashboard, `bytes_in` de un host TEST-NET sintético
  corresponde al `src_ip` del flujo, no a un juicio de inbound/outbound real.
  No usar estos datos para conclusiones de dirección sin la política de redes.

## 5. Timestamps

- **pcap**: timestamp de captura (cuando el paquete se vio en el interfaz).
- **Flow**: `first_switched`/`sysUptime` relativo al uptime del router, o los
  IE de fecha absoluta (150/152/154/156); el normalizador convierte a
  `ts_nanos` según prioridad documentada en `protocol/record.rs`
  (`finish()`). El export time del header es el respaldo.
- **Implicación**: el evento flow se data cuando el router lo dice, no cuando
  el agente lo recibió; con reenvíos o buffers el orden temporal puede
  difierir del orden real. Los fixtures usan timestamps fijos
  (unix_secs=1_700_000_000) por determinismo.

## 6. Ventanas del aggregator (comportamiento event-driven)

El aggregator (`sc-aggregate/src/window.rs`) cierra una ventana **solo** cuando
llega un `FlowUpdate` nuevo con `now >= window_end`; sin flujos no hay flush y
la ventana queda abierta hasta el siguiente flujo (o hasta el cierre del canal
al apagarse el agente). Consequences observadas en la validación sintética:

- Tráfico continuo (exportadores sintéticos, MikroTik con export periódico) →
  flush en cada borde y ventanas de 30 s completas.
- Tráfico escaso → la ventana con datos recientes se materializa recién con el
  siguiente flujo; un `taskkill /F` pierde la ventana abierta.
- Ventanas solo-captura (paquetes locales sin flujos normalizados) aparecen con
  `bytes_in = 0`.

No es un defecto de M4, pero condiciona la interpretación de evidencias y el
soak de 24 h: el agente debe apagarse limpio para no perder la última ventana.

## 7. Dedup cuando pcap y flow ven el mismo segmento

**No existe hoy.** Si el agente corre con `--live` (pcap) y `--collector`
(flow) sobre el mismo tráfico, los mismos octetos pueden entrar dos veces por
canales distintos al aggregator y sumarse dos veces en la ventana. En la
validación sintética no hubo duplicación de hosts TEST-NET porque la captura
loopback solo ve tráfico local (127.0.0.1) que no genera hosts de red, pero
eso no cubre un segmento real.

- Estado: **P1** (definir dedup: por 5-tuple + ventana, o fuente exclusiva
  pcap vs flow por red).
- Mientras tanto: en producción, elegir una sola fuente por segmento (pcap
  para LAN local, flow para tráfico del router) o aceptar la sobreestimación.

## 8. Resumen rápido

| Dimensión          | pcap (`sc-capture`)              | flow (`sc-collector`)                        |
| ------------------ | -------------------------------- | -------------------------------------------- |
| Sampling           | ninguno                         | posible en el router, hoy ignorado           |
| Disponibilidad     | en vivo, por paquete            | al cerrar el flujo (timeouts)                |
| Bytes/paquete      | tamaño real por paquete         | solo contadores bytes/packets                |
| Capa 2 (MAC)       | sí                              | no                                           |
| Dirección host     | por contexto de captura         | `Direction::In` → `src_ip` (provisional)     |
| Timestamp          | captura                         | first_switched / IE absolutos / export time  |
| Duplicado          | un paquete, un evento           | sin dedup con pcap (P1)                      |
| Requiere           | interfaz + Npcap/libpcap        | router exportando + puertos abiertos         |
