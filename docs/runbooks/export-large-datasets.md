# Runbook — Exportación de datasets grandes (>10k filas)

## Límite
- Máximo 10,000 filas por exportación. Más filas → `413 { error: 'dataset_too_large', message: 'Dataset demasiado grande, filtra por fecha (limit 10000 filas).' }`.

## Cómo descargar sin hitting el límite
1. Elegir el `range` más chico posible (`15m` < `1h` < `6h` < `24h` < `7d` < `30d`).
2. Repetir por métrica (`hosts`, `alerts`, `overview` como XLSX multi-sheet) y unir los archivos localmente.
3. El CSV se sirve con streaming (`ReadableStream` en lotes de 500); un CSV de 10k filas no materializa un string gigante.

## CSV Injection
- Celdas que empiezan con `=`, `+`, `-` o `@` se exportan antepuestas con `'` (texto en Excel). Verificar con la celda `=CMD('calc')`.

## Auditoría
- Cada exportación queda en `export_logs` (rol + device, sin user_id) y se revisa en `/dashboard/admin/exports`.
