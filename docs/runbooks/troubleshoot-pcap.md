# Runbook — Troubleshoot de captura pcap

Aplica a `sc-capture` en Windows (Npcap) y Linux (libpcap). Regla del spec §8.2: los drops nunca son silenciosos — se reflejan en `packets_dropped` y en `capture_status`.

## Matriz de síntomas

| Síntoma (log / dashboard) | Causa probable | Acción |
|---|---|---|
| `capture_status: error` desde el arranque; "No se pudo abrir interfaz" | Sin privilegios pcap | Windows: instalar **Npcap con opción "WinPcap API-compatible mode"** y ejecutar el servicio como SYSTEM/admin; Linux: dar `CAP_NET_RAW` (ver runbook Linux §3) |
| `Npcap no encontrado` | Npcap no instalado o sin modo WinPcap compatible | Reinstalar Npcap marcando la opción; **no redistribuir** (ver `legal/npcap-notice.md`) |
| `capture_status: ok` pero `packets_seen` no crece | Interfaz equivocada | Config `[capture] interface = "<nombre-exacto>"` (listar interfaces con el binario o `ipconfig /all`); revisar VPN/loopback |
| Alta tasa de `packets_dropped` | Backpressure (canal 10k lleno), CPU bajo | Reducir `snaplen` (ej: 600); activar `[capture] promiscuous=false` si no es necesario; revisar picos; monitorear `cpu_percent` en health |
| `parse_errors` creciente | Formatos raros / truncados (snaplen corto) | Aumentar `snaplen` a 1500; anotar el tipo de paquete en log; si persiste, abrir issue con fixture del paquete (sin contenido crudo en pruebas) |
| Daemon captura pero se detiene tras N min | Crash del pcapture thread | Verificar log: backoff exponencial 1–60 s y reinicio; si reinicia sin parar, capture stack y abrir issue |
| Snapshots sin hostnames legibles (solo `host_key`, `ip_display: null`) | Esperado con `anonymize_hosts=true` (regla de privacidad) | No es error. Si se necesitan nombres reales, desactivar anonimización en config (implicancias en `legal/privacy-policy-draft.md`) |

## Secuencia de diagnóstico (5 min)

1. `Get-Content logs\agent.log -Tail 100` (o `journalctl -u sc-sentinel-agent -n 100`).
2. Confirmar que el binario corre como esperado y **ve la interfaz**.
3. Corroborar salud del último snapshot en dashboard → Settings → "Salud del agente".
4. Windows: `netsh trace` no hace falta — pero sí probar un `ping` externo y verificar que `packets_seen` suba.
5. Si `packets_dropped > 0` reproducible: colapsar carga y abrir issue con la tasa y el health del snapshot.

## Reglas de reporting (obligatorias)

- **Nunca** adjuntar raw packets ni contenido de payloads en tickets (logging rules §9.3).
- Adjuntar solo: versión del agente, `capture_status`, agregaciones y flags del config sin token.
