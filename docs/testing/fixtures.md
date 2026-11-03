# Fixtures de prueba (organización y reglas)

Los fixtures son entrada y salida congelada de las pruebas: cualquier modificación debe ser un cambio de contrato visible en el PR (no una "actualización de test").

## Ubicación en el repo

```text
docs/contracts/                      # contratos y ejemplos NORMATIVOS (compartidos Rust↔TS)
└── examples/
    ├── ingest-request.valid.json    # payload completo válido (golden entrada)
    ├── ingest-request.invalid.json  # violaciones esperadas (ver _description)
    ├── snapshot-minimal.json        # snapshot mínimo legal (arrays vacíos + health)
    └── snapshot-with-alerts.json    # snapshot con alertas deterministas + health degradada

agent/crates/*/tests/fixtures/       # fixtures específicos de Rust
├── pcap/                            # pcap fijo de loopback (integration sc-capture→sc-sync)
│   └── loopback-sample.pcap
└── golden/                          # golden files de snapshots (insta) — regenerar con cargo insta

web/lib/schemas/__fixtures__/        # mismos shapes reutilizados en Vitest (zod)
```

## Reglas

1. **Un solo juego de verdades**: los JSON de `docs/contracts/examples/` son los que validan zod (web) y serde (agent). Los demás derivan o referencian a ellos.
2. **Golden tests (insta)**: al cambiar lógica de agregación, regenerar (`cargo insta review`) y revisar el diff POR VENTANA, no en bloques.
3. **PCAP fijo**: determinista (generado una vez con tráfico sintético/loopback); los tests no dependen de red real ni de hora de reloj (timestamps fijos en fixtures).
4. `ingest-request.invalid.json` debe fallar por estos motivos concretos: `duration_ms` negativo, `bytes_in` negativo, `risk_score` > 1, `port` > 65535, `protocol` fuera de enum, código país inválido, `rule_id` con caracteres no permitidos, `severity` fuera de enum, `capture_status` fuera de enum, `packets_dropped` negativo, `spool_bytes` > cota, y `ip_display` distinta de null con anonymization presuntiva (fixture documentativo de la regla de privacidad).
5. **Sin PII en fixtures**: hosts siempre `host_key` + `ip_display: null`; ninguna IP/hostname real, ni dominios reales de la infraestructura del propietario.
6. Nombres: `<area>.<scenario>.json` — p. ej. `spi.drain-offline-batches.json` (spool), `ai.facts-window.pxd.json` (hechos IA).
