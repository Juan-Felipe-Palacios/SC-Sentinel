# Nota legal — Npcap (driver de captura en Windows)

**Uso:** driver para capturar paquetes en Windows, requerido por el binario del agente (crate `pcap`).

## Decisión normativa del proyecto

- **Npcap NO se redistribuye con el instalador ni dentro de los releases del agente** (runbook `install-agent-windows.md` § Requisitos). La descarga/instalación es del usuario.
- Cada instalación del agente en Windows requiere que el usuario instale Npcap **con opción "WinPcap API-compatible mode"** (troubleshoot-pcap.md).

## Por qué (licencia)

- Npcap tiene licencia **gratuita para uso personal / sin fines de lucro** con restricciones para uso comercial/redistribución:
  - La **redistribución** de Npcap (incluido en instaladores OEM o en bundle) requiere una licencia OEM de Cace Technologies (Nmap Project).
  - SC-Sentinel evita esa obligación pidiendo al usuario instalar Npcap por separado desde la fuente oficial (`https://npcap.com`).
- Si en el futuro se desea distribuir un instalador que incluya Npcap, es necesario evaluar el acuerdo OEM de Npcap (decisión presupuestaria del propietario; registrarla como ADR en ese momento).

## Contenido visible en la superficie del usuario

- Requisito: "Npcap instalado (no se redistribuye)" — landing `/security` y runbooks lo mencionan así.
- Enlaces: instalación oficial de Npcap en el runbook de instalación Windows.
- No incluir marca Npcap como algo que SC-Sentinel provee o respalda.
