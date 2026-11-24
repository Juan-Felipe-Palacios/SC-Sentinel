# scripts/lib/agent-binpath.psm1 — construye el binPath del servicio SC-Sentinel-Agent.
# Función pura (sin efectos) para poder testearla sin instalar nada.

function Get-AgentBinPath {
 param(
  [Parameter(Mandatory=$true)]
  [string]$BinPath,

  [Parameter(Mandatory=$true)]
  [string]$ConfigFile,

  # Descripcion NDIS del adaptador o nombre de dispositivo pcap
  # (\Device\Npcap_{GUID}). Vacio => collector-only (--no-capture).
  # OJO: NO matchea el nombre amigable de Windows ("Wi-Fi") — el agente
  # matchea contra d.name (pcap) o d.desc (descripcion), ver
  # agent/crates/sc-capture/src/live.rs. Con un nombre invalido el
  # servicio aborta con exit 1 (InterfaceNotFound).
  [string]$CaptureInterface
 )

 if ($CaptureInterface) {
  return "`"$BinPath`" --config `"$ConfigFile`" --interface `"$CaptureInterface`""
 }
 # Modo collector-only: sin argumentos. El SCM no entrega el binPath tal cual
 # (run 45268816783: el proceso recibio '-config' donde el ImagePath decia
 # '--config'), asi que el modo por defecto no depende de la linea de ordenes:
 # `with_service_defaults` en sc-agent aplica el config instalado y
 # `--no-capture` cuando no hay fuente de captura. La fuente de datos es el
 # colector UDP (NetFlow/IPFIX).
 return "`"$BinPath`""
}

# Carpeta del servicio a partir de su ImagePath: quita comillas y argumentos.
# Es la unica fuente fiable en una actualizacion (/D y la clave InstallDir del
# registro pueden apuntar a una instalacion anterior). Funcion pura: no toca el
# disco, para poder probarla sin instalar nada.
function Get-InstallDirFromImagePath {
 param([string]$ImagePath)

 if (-not $ImagePath) { return '' }
 $text = $ImagePath.Trim()
 if (-not $text) { return '' }
 if ($text.StartsWith('"')) {
  $end = $text.IndexOf('"', 1)
  if ($end -le 1) { return '' }
  $exe = $text.Substring(1, $end - 1)
 } else {
  # Sin comillas no se puede cortar en el primer espacio: "C:\Program Files\..."
  # lo tiene en la propia ruta. Se corta en el ultimo .exe.
  $idx = $text.ToLowerInvariant().LastIndexOf('.exe')
  if ($idx -gt 0) {
   $exe = $text.Substring(0, $idx + 4)
  } else {
   $exe = ($text -split '\s+')[0]
  }
 }
 if (-not $exe) { return '' }
 $dir = Split-Path -Parent $exe
 if (-not $dir -or $dir -eq '\') { return '' }
 return $dir.TrimEnd('\')
}

function Set-AgentImagePath {
 param(
  [Parameter(Mandatory=$true)]
  [string]$ServiceKey,

  [Parameter(Mandatory=$true)]
  [string]$BinPath,

  [Parameter(Mandatory=$true)]
  [string]$ConfigFile,

  [string]$CaptureInterface
 )

 $newPath = Get-AgentBinPath -BinPath $BinPath -ConfigFile $ConfigFile -CaptureInterface $CaptureInterface
 Set-ItemProperty -Path $ServiceKey -Name ImagePath -Value $newPath
 return $newPath
}

Export-ModuleMember -Function Get-AgentBinPath, Set-AgentImagePath, Get-InstallDirFromImagePath
