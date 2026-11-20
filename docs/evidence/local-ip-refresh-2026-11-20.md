# Evidencia — refresco de IPs locales (Etapa A y B)

Fecha: 2026-11-20 (UTC). Instancia CLI aislada, device de prueba
`dev_local_dhcp_test`, puerto de estado `127.0.0.1:8388`, endpoint de ingesta
inalcanzable a propósito. Nunca se usó el servicio de producción.

Nota de contrato: el fix no se valida por `ipv4_count=2` (inalcanzable en este
Windows, ver el hallazgo de plataforma en `docs/runbooks/test-dhcp-refresh.md`)
sino por **refresh ante cambio de contenido del conjunto de IPs**, que es el bug
de 0.1.7.

## Etapa A — sustitución de dirección con rollback

| Cambio | Marca del cambio | `local_ips_refreshed` | Latencia |
| --- | --- | --- | --- |
| `192.168.1.40` → `192.168.1.250` | 19:32:22.887Z | 19:32:29.071Z | 6,18 s |
| `192.168.1.250` → DHCP `192.168.1.40` | — | 19:34:26.052Z | dentro del tick de 5 s |

Ambos eventos con `usable_ipv4=true`; `capture_status=ok`; `parse_errors=0`;
`last_error=null`; `stderr` de la instancia vacío; `packets_seen` 2.426 → 32.342
durante la ventana. Eventos previos de la misma sesión: 19:28:50, 19:29:57,
19:30:02.

Cada sustitución dejó la interfaz en estática y sin ruta por defecto
(`DEFAULT_ROUTE_PRESENT=False`, medido dos veces). El rollback (`netsh interface
ipv4 delete address` + `set address source=dhcp` + `ipconfig /renew`) restauró
`192.168.1.40 Dhcp` y la ruta vía `192.168.1.1` en ambos casos.

**Anomalía:** el primer cambio estático (19:22) se reflejó a las 19:27:29 (~5
min); los cuatro siguientes, en 5–7 s. Sin explicar; hipótesis y plan de retest en
el runbook.

## Etapa B — release / renew real

| Paso | Marca | Evidencia |
| --- | --- | --- |
| Línea base | 19:53:04Z aprox. | `capture_status=ok`, `local_ips_usable=true`, `local_ips_ipv4=1` |
| `ipconfig /release "Wi-Fi"` | 19:55:03.376Z | APIPA `169.254.77.7`, `DEFAULT_ROUTE=False` |
| `local_ips_refreshed` + `local_ips_degraded` | 19:55:04.518Z | `ipv4_count=0 ipv6_count=2 usable_ipv4=false` (1,14 s tras el release) |
| APIPA detectada | 19:55:14.651Z | `ipv4_count=1 ... usable_ipv4=false` (link-local no es utilizable) |
| `/status` en degraded | 19:55:19.595Z | `capture_status=degraded`, `local_ips_usable=false`, `packets_seen=6934` |
| GUI contra 8388 | ~19:55:22Z | badge **ADVERTENCIA** ámbar, «Requiere atención», «captura degradada (sin IPv4 utilizable)», detalle «sin IPv4 local utilizable (vacío/APIPA). El monitor reintenta cada 5 s» |
| Concesión recuperada (autorrenovación de Windows) | evento 20:14:41.496Z | `ipv4_count=1 ... usable_ipv4=true` → `degraded → ok` |
| `ipconfig /renew "Wi-Fi"` (manual) | 20:23:14.660Z | `.40 Dhcp`, ruta `192.168.1.1`; **sin evento nuevo** porque el contenido no cambió |
| `/status` final | 20:23:29.023Z | `capture_status=ok`, `local_ips_usable=true`, `packets_seen=45.722`, `packets_dropped=0`, `parse_errors=0`, `last_error=null` |
| GUI contra 8388 | ~20:23:31Z | badge **OK** verde, «Agente operativo», 47.468 vistos, 0 descartados, 0 errores de parseo, «Último error: ninguno» |

Literal del log (recortado a las líneas de `local_ips_*`, sin payloads):

```text
2026-11-20T19:55:04.518291Z  INFO sc_capture::monitor: IPs locales actualizadas event="local_ips_refreshed" ipv4_count=0 ipv6_count=2 usable_ipv4=false
2026-11-20T19:55:04.518344Z  WARN sc_capture::monitor: sin IPv4 local utilizable; el monitor seguirá reintentando event="local_ips_degraded" ipv4_count=0
2026-11-20T19:55:14.650692Z  INFO sc_capture::monitor: IPs locales actualizadas event="local_ips_refreshed" ipv4_count=1 ipv6_count=2 usable_ipv4=false
2026-11-20T20:14:41.495893Z  INFO sc_capture::monitor: IPs locales actualizadas event="local_ips_refreshed" ipv4_count=1 ipv6_count=2 usable_ipv4=true
```

La captura no se reinició en ningún momento: las ventanas de 30 s siguieron
emitiéndose durante el degraded (con menos paquetes, por la falta de red) y
reanudaron volumen tras recuperar la concesión (ventana 20:14:30: 15.354 →
29.019 paquetes acumulados).

## Limitaciones de esta corrida

- El renov manual se ejecutó a las 20:23:14 porque la aprobación elevada no
  llegó antes; Windows ya había recuperado la concesión a las ~20:14:37. El
  estado degradado duró por eso ~19,6 min en lugar de los 10–30 s previstos. No
  afecta al literal medido (`degraded → ok` con refresh por contenido).
- El retest de la anomalía (set estático + restauración en instancia limpia) no
  se ejecutó: la ventana de aprobación elevada expiró con el owner fuera del
  equipo. Queda pendiente con el procedimiento del runbook.
- No se adjuntan identificadores de dispositivo (GUID de interfaz) ni tokens.
