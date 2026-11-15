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
 # Modo collector-only por defecto: la fuente de datos es el colector UDP
 # (NetFlow/IPFIX). Sin fuente de captura, arrancar sin --no-capture aborta
 # con codigo 2 (el agente exige --interface).
 return "`"$BinPath`" --config `"$ConfigFile`" --no-capture"
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
