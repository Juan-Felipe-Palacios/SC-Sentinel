# How-to — añadir una regla de detección

1. Definir el `rule_id` (snake_case, ≤64 chars) y la severidad.
2. Añadir umbrales a `DetectorConfig` con default sensato.
3. Implementar `detect_<regla>` en `agent/crates/sc-detect/src/lib.rs`, siguiendo el patrón: validar condiciones, `alerts.push(alert(...))`, `bump_score(...)` si aplica.
4. Respetar privacidad: redactar si `ip_display.is_none()`.
5. Añadir tests en el módulo `tests` (caso positivo, negativo, redacción, tope de alertas).
6. Actualizar `docs/reference/detection-rules.md` y `docs/visuals/risk-score-calculation.md` (score y banda).
7. Ejecutar `cargo test -p sc-detect` y `cargo clippy --workspace --all-targets -- -D warnings`.
8. Si la regla emite `risk_score`, actualizar el diagrama `risk-score-calculation.mmd`.