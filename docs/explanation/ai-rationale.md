# Explicación — determinista primero, IA después

## Decisión (ADR-0005)

El motor determinista `sc-detect` es la fuente de verdad: genera `Alert` y `risk_score`. La IA solo interpreta hechos ya persistidos (resumen, hallazgos, recomendaciones) y nunca crea alertas.

## Motivos

- **Explicabilidad:** reglas con umbrales absolutos, reproducibles por ventana.
- **Coste:** IA por lotes cada 15 min, no por paquete.
- **Seguridad:** evita prompt injection como fuente de decisiones (M6).
- **Disponibilidad:** si la IA falla, el dashboard sigue mostrando alertas y scores.

## Heurística cloud (respaldo)

Mientras `sc-detect` no emita `risk_score` real, `web/lib/risk/heuristic.ts` rellena un piso de banda baja (ADR-0005). El valor del agente siempre tiene prioridad.

## Cadena de proveedores

Gemini → OpenRouter → Groq, con cooldown en 429 y backoff en 5xx. Presupuesto diario opcional (`AI_DAILY_CALL_BUDGET`). Dedup por `facts_hash`.