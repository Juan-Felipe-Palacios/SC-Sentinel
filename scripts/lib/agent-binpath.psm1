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

Export-ModuleMember -Function Get-AgentBinPath, Set-AgentImagePath
