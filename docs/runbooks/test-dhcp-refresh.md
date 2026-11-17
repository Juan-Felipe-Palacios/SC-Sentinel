# Runbook — Probar el refresco de IPs locales (DHCP)

Verifica el fix de `LocalIpSet` contra el resolver real de Npcap. Se ejecuta
sobre una **instancia CLI temporal**, nunca sobre el servicio de producción.

**Riesgo:** la etapa B corta la conectividad de la máquina durante 10–30 s.
Ejecutarla localmente, no por una sesión remota, y fuera de otras verificaciones.

## Requisitos

- Windows con Npcap instalado y el binario compilado con `sc-capture/live`.
- PowerShell elevado para agregar/quitar una IP y para `ipconfig /release`.
- El servicio de producción puede seguir corriendo: la instancia CLI usa otro
  spool, otro puerto de estado y otra interfaz de captura.

## 0. Preparar la instancia aislada

Elegir un directorio temporal y un device de prueba:

```powershell
$root = Join-Path $env:TEMP "sc-dhcp-refresh"
New-Item -ItemType Directory -Force $root | Out-Null
$env:SC_STATUS_ADDR = "127.0.0.1:8388"
$env:SC_INGEST_TOKEN = "test-only-no-es-un-secreto"
```

`config.toml` (los paths son absolutos y quedan fuera del repo):

```toml
[ingest]
url = "http://127.0.0.1:9/api/ingest"
token_env = "SC_INGEST_TOKEN"

[privacy]
hmac_key_file = "C:/Users/<usuario>/AppData/Local/Temp/sc-dhcp-refresh/host-key"

[spool]
path = "C:/Users/<usuario>/AppData/Local/Temp/sc-dhcp-refresh/spool.db"

[log]
level = "info"
file = "C:/Users/<usuario>/AppData/Local/Temp/sc-dhcp-refresh/agent.log"

[collector]
enabled = false
```

El endpoint `127.0.0.1:9` es deliberadamente inalcanzable: no se envía nada a
producción y el spool temporal absorbe las ventanas. El token es un valor de
prueba, no una credencial real.

Obtener el nombre Npcap de la interfaz (se usa el GUID, no el nombre amigable):

```powershell
.\target\release\sc-sentinel-agent.exe --list-interfaces
# copiar la entrada \Device\NPF_{GUID} de Wi-Fi
```

Arrancar la instancia en una consola elevada, sin `--no-capture`:

```powershell
.\target\release\sc-sentinel-agent.exe `
  --config "$root\config.toml" `
  --device-id dev_local_dhcp_test `
  --interface "\Device\NPF_{GUID}" `
  --no-collector
```

Verificar que responde y que la captura está activa:

```powershell
Invoke-RestMethod http://127.0.0.1:8388/status |
  Select-Object capture_status, local_ips_usable, local_ips_ipv4,
                local_ips_last_refresh
```

Guardar esta primera salida en `$root\evidence\00-inicial.json`.

## Etapa A — Agregar y retirar una IPv4 secundaria (sin cortar la red)

Esta etapa ejercita `pcap_findalldevs` contra un cambio real del sistema
operativo sin liberar el DHCP de la interfaz.

1. Elegir una IPv4 libre de la misma subred (ejemplo: `192.168.1.250`) y
   agregarla:

```powershell
New-NetIPAddress -InterfaceAlias 'Wi-Fi' `
  -IPAddress 192.168.1.250 -PrefixLength 24
```

2. En **≤10 s** (dos ticks del monitor), el log debe contener un evento
   `local_ips_refreshed` con `ipv4_count` mayor y `usable_ipv4=true`:

```powershell
Select-String -Path "$root\agent.log" -Pattern 'local_ips_refreshed' |
  Select-Object -Last 5
Invoke-RestMethod http://127.0.0.1:8388/status |
  Select-Object capture_status, local_ips_usable, local_ips_ipv4,
                local_ips_last_refresh |
  ConvertTo-Json | Set-Content "$root\evidence\01-ip-agregada.json"
```

3. Desde otro host, generar tráfico hacia `192.168.1.250` (por ejemplo, un
   `Test-NetConnection` o un `ping` continuo). La instancia debe reflejarlo en
   `packets_seen` y en la ventana activa de `/status`; no se adjuntan paquetes
   crudos.

4. Retirar la IP:

```powershell
Remove-NetIPAddress -InterfaceAlias 'Wi-Fi' `
  -IPAddress 192.168.1.250 -Confirm:$false
```

5. En **≤10 s** debe aparecer otro `local_ips_refreshed` con `ipv4_count`
   menor, sin `panic` y sin detener la captura. Guardar el status y el log.

**Aceptación A:** refresh en ambas direcciones en ≤2 ticks; `capture_status`
vuelve a `ok`; `packets_seen` sigue creciendo; cero panics.

## Etapa B — Release/renew completo (escenario original)

**Cortar la conectividad local; no hacerlo por RDP.**

1. Liberar la concesión:

```powershell
ipconfig /release "Wi-Fi"
```

2. En **≤10 s** el monitor debe publicar `local_ips_degraded` y `/status` debe
   mostrar `capture_status=degraded` (vacío/APIPA o solo IPv6):

```powershell
Select-String -Path "$root\agent.log" -Pattern 'local_ips_degraded' |
  Select-Object -Last 5
Invoke-RestMethod http://127.0.0.1:8388/status |
  Select-Object capture_status, local_ips_usable, local_ips_ipv4,
                local_ips_last_refresh |
  ConvertTo-Json | Set-Content "$root\evidence\02-release.json"
```

3. Renovar la concesión:

```powershell
ipconfig /renew "Wi-Fi"
```

4. Cuando termine DHCP (5–30 s), el monitor debe publicar un nuevo
   `local_ips_refreshed`, `capture_status` debe volver a `ok` y las ventanas
   deben reanudar `bytes > 0`:

```powershell
Invoke-RestMethod http://127.0.0.1:8388/status |
  Select-Object capture_status, local_ips_usable, local_ips_ipv4,
                local_ips_last_refresh, windows |
  ConvertTo-Json -Depth 5 |
  Set-Content "$root\evidence\03-renew.json"
```

**Aceptación B:** `degraded → ok` visible; refresh con la IPv4 nueva; ventanas
con bytes > 0; cero panics; la captura no se reinicia.

## Evidencia y cierre

Guardar en `$root\evidence\`:

- `agent.log` recortado a las líneas de `local_ips_*` (sin payloads).
- Los tres JSON de `/status`.
- La salida de `Get-NetIPAddress` antes y después de la etapa A.

No incluir tokens, contenido de paquetes ni identificadores de producción. Al
terminar, detener **solo** el proceso CLI iniciado para esta prueba (por PID o
Ctrl+C en su consola), retirar cualquier IP secundaria que haya quedado y borrar
`$root`. No detener, instalar ni reconfigurar el servicio de producción.

## Criterio de fallo

Si no hay `local_ips_refreshed` en ≤10 s, revisar en este orden: que la
instancia use el GUID correcto, que Npcap enumere la interfaz, que el log
corresponda a esa instancia y que el monitor no esté registrando
`local_ips_refresh_failed`. Un fallo de resolución conserva el conjunto anterior
por diseño; no vacía la tabla.
