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

## Hallazgo de plataforma: no hay coexistencia DHCP + estática por estas vías

Medido el 2026-11-20 sobre la interfaz Wi-Fi de prueba: tanto
`New-NetIPAddress -InterfaceAlias 'Wi-Fi'` como
`netsh interface ipv4 add address name="Wi-Fi"` convierten la interfaz a
direccionamiento **estático**, eliminan la concesión DHCP y **borran la ruta por
defecto** (`DEFAULT_ROUTE_PRESENT=False`). Se reprodujo dos veces, con rollback
verificado.

Consecuencia: la etapa A ya **no agrega un secundario**. Sustituye la dirección
y restaura DHCP en el mismo paso, con rollback automático para no dejar la
máquina sin ruta por defecto.

El contrato que se verifica es el del bug de 0.1.7: **`local_ips_refreshed` se
emite por cambio de contenido del conjunto, aunque el conteo no cambie.** Un
`ipv4_count=2` no es alcanzable en este Windows y no es criterio de aceptación.

## Etapa A — Sustituir la dirección IPv4 con rollback (sin liberar el DHCP)

Ejercita `pcap_findalldevs` contra un cambio real del sistema operativo sin
liberar la concesión por `ipconfig /release`.

1. Verificar y anotar el estado previo (IP, sufijo, ruta):

```powershell
Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 |
  Select-Object IPAddress, PrefixLength, SuffixOrigin
Get-NetRoute -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 `
  -DestinationPrefix '0.0.0.0/0' | Select-Object NextHop
```

2. Sustituir y **restaurar en el mismo script** (el `finally` es obligatorio: si
   falla el renew, la interfaz tiene que quedar en DHCP igual):

```powershell
$ErrorActionPreference = 'Stop'
"CHANGE_AT_UTC=$((Get-Date).ToUniversalTime().ToString('o'))"
try {
  New-NetIPAddress -InterfaceAlias 'Wi-Fi' `
    -IPAddress 192.168.1.250 -PrefixLength 24 | Out-Null
  Start-Sleep -Seconds 12   # ventana de observación del tick
} finally {
  netsh interface ipv4 delete address name="Wi-Fi" address=192.168.1.250 | Out-Null
  netsh interface ipv4 set address name="Wi-Fi" source=dhcp | Out-Null
  ipconfig /renew "Wi-Fi" | Out-Null
}
"RESTORE_AT_UTC=$((Get-Date).ToUniversalTime().ToString('o'))"
Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 |
  Select-Object IPAddress, PrefixLength, SuffixOrigin
Get-NetRoute -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 `
  -DestinationPrefix '0.0.0.0/0' | Select-Object NextHop
```

3. En **≤10 s** de cada cambio (dos ticks del monitor), el log debe contener un
   `local_ips_refreshed` con la dirección nueva y `usable_ipv4=true` en los dos
   sentidos:

```powershell
Select-String -Path "$root\agent.log" -Pattern 'local_ips_' |
  Select-Object -Last 5
Invoke-RestMethod http://127.0.0.1:8388/status |
  Select-Object capture_status, local_ips_usable, local_ips_ipv4,
                local_ips_last_refresh |
  ConvertTo-Json | Set-Content "$root\evidence\01-ip-sustituida.json"
```

4. Verificar que la red quedó usable: `SuffixOrigin=Dhcp`, `0.0.0.0/0` con
   `NextHop` presente y `packets_seen` creciendo entre dos lecturas.

5. Repetir el ciclo una vez más: el primer cambio de una instancia recién
   arrancada puede ser el que exhibe la anomalía de abajo.

**Aceptación A:** refresh por cambio de contenido en ambos sentidos en ≤2 ticks;
`usable_ipv4=true` tras cada restauración; ruta por defecto presente al
terminar; `capture_status=ok`; `packets_seen` creciendo; cero panics.

### Anomalía conocida: el primer cambio estático puede tardar minutos

Medido el 2026-11-20: el primer cambio a estática (19:22) se reflejó a las
19:27:29 (~5 min), mientras los cuatro cambios siguientes tardaron 5–7 s. La
hipótesis (sin verificar) es que la notificación de cambio de dirección no se
dispara para un set estático y sí para el `renew`, que es lo que invalida la
caché del resolver de Npcap.

No bloquea el escenario de producción (DHCP: el renew notifica, y eso es lo que
mide el gate). Retest: en una instancia limpia, aplicar el paso 2 y medir la
latencia en ambos sentidos. Si queda **≤10 s**, la demora fue contextual (pérdida
de ruta en el primer intento); si vuelve a ~5 min, es limitación confirmada del
monitor y se abre ticket de Etapa 2 (P1: escuchar `NotifyAddrChange` /
`WM_DEVICECHANGE` o forzar frescura del resolver en vez de depender de la
notificación).

## Etapa B — Release/renew completo (escenario original)

**Cortar la conectividad local; no hacerlo por RDP.**

1. Liberar la concesión:

```powershell
ipconfig /release "Wi-Fi"
```

2. En **≤10 s** el monitor debe publicar `local_ips_degraded` y `/status` debe
   mostrar `capture_status=degraded` (vacío/APIPA o solo IPv6). Medido: primero
   `ipv4_count=0` y a los ~10 s una APIPA (`169.254.x.x`) con `ipv4_count=1`;
   en ambos casos `usable_ipv4=false`, porque una dirección link-local no es
   utilizable para captura:

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
