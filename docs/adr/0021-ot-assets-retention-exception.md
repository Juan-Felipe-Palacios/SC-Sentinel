# ADR-0021 — Excepción de retención para `ot_assets`

- **Estado**: aceptado
- **Fecha**: 2026-11-25
- **Relacionadas**: ADR-0008 (idempotencia), ADR-0018 (ingest transaccional),
  ADR-0022 (invariante pasivo)
- **Contexto de código**: `web/lib/cleanup/retention.ts`,
  `docs/runbooks/database-cleanup.md`,
  `docs/designs/m6-passive-ot-identification.md` (§Read model, Appendix B)

## Contexto

El cron diario de limpieza aplica una retención cerrada por tabla
(`RETENTION_DAYS`, `web/lib/cleanup/retention.ts:22-32`): 7 días para ventanas,
estadísticas de host y métricas de salud; 15 para insights de IA; 30 para
alertas; 90 para la auditoría de alertas; 2 para los batches de idempotencia.
Ese mapa es la única fuente que consulta `runRetentionCleanup`; una tabla que no
figura en él no se toca.

`ot_assets` (M6) es el read model de inventario OT por dispositivo: una fila por
activo observado, `UNIQUE (device_id, host_key)`, 24 columnas y `fillfactor=80`
(diseño, §Read model; DDL en Appendix B). No guarda payloads ni valores de
registros: guarda identidad hasheada, rol, protocolos, contadores y estado de
baseline.

La vida útil de un activo no es la de una ventana. Un PLC puede pasar semanas o
meses sin tráfico y seguir siendo parte del inventario; que desaparezca del
inventario es justamente una señal que el operador necesita ver. Si `ot_assets`
se tratara como `flow_windows`, una retención de 30 días borraría el inventario en
silencio y las reglas de "maestro nuevo" perderían su referencia.

Hechos medidos el 2026-11-25 (consulta de sólo lectura): la base tiene 17 tablas
en `public` y 8,8 MB; `to_regclass('public.ot_assets')` devuelve `null`; no hay
filas que permitan estimar crecimiento real.

## Decisión

1. **`ot_assets` queda fuera de `RETENTION_DAYS`.** No se agrega al mapa ni al
   cron de `/api/cron/cleanup`. La exclusión es explícita y verificable: un test
   de `retention.test.ts` debe afirmar que la tabla no está en el mapa (etapa E3).
2. **La frescura se deriva, no se persiste.** El predicado es
   `now() - last_seen > interval '30 days'`, calculado en la consulta; no hay
   `updated_at` ni un cron que haga `UPDATE` diario sólo para marcar antigüedad.
   La UI filtra los activos viejos de la vista activa.
3. **Poda manual por defecto; automática sólo con opt-in.** El propietario puede
   podar activos con `last_seen` anterior a 180 días. La poda automática a 180
   días existe como opción, pero no se habilita sin una decisión explícita y sin
   revisar este ADR.
4. **Requisitos antes de aplicar `0017_ot-assets.sql`** (además de la aprobación
   de M6, que este ADR no sustituye):
   - test que afirme la exclusión de `RETENTION_DAYS`;
   - este runbook con la política y el SQL de poda;
   - `/legal/privacy` listando la tabla y su retención (AGENTS.md §8.4);
   - política de baja de `devices` con activos (punto 5).
5. **Sin `ON DELETE CASCADE`.** `device_id` referencia `devices(id)` sin cascada.
   Dar de baja un dispositivo que todavía tiene activos debe decidirse antes de
   que exista la tabla; no se resuelve por accidente con un `DELETE` de
   `devices`. Esa política es un gate de E3, no de este ADR.
6. **Cualquier cambio de retención vuelve a este ADR.** Tocar el mapa, el umbral
   de 30 días o la poda de 180 días exige actualizar este documento, la spec y el
   runbook en el mismo cambio (AGENTS.md §13.5).

## Lo que este ADR no decide

- No sustituye la decisión del propietario sobre M6: `docs/plans/etapa-2-backlog.md:49`
  la registra (aprobado 2026-11-25 con F1 OT en allowlist); este ADR no la modifica.
- No habilita la poda automática de 180 días.
- No fija zonas Purdue ni el esquema de permisos del dashboard.

## Alternativas consideradas

- **Incluir `ot_assets` en `RETENTION_DAYS` con 30 días.** Es lo más simple y lo
  más destructivo: el inventario desaparece tras un mes sin tráfico, que es
  exactamente el caso de un activo OT estacional o en mantenimiento. Descartada.
- **Retención infinita sin poda.** Conserva el inventario, pero contradice la
  promesa de retención acotada de `/legal/privacy` y deja crecer la tabla sin
  límite. Descartada como default; la poda manual de 180 días cubre el caso.
- **Poda automática a 180 días por defecto.** Un activo legítimamente inactivo
  durante seis meses se borraría sin revisión humana. Descartada; queda como
  opt-in.
- **Guardar sólo agregados en `flow_windows`.** Evita una tabla nueva, pero no da
  un read model consultable ni permite estado de baseline por activo. Descartada
  por el diseño de M6.

## Consecuencias

- **Positivas:** el inventario sobrevive al cleanup; el coste de limpieza no
  cambia; la retención sigue siendo explícita y auditable; no se agrega trabajo al
  cron.
- **Negativas:** hay una tabla fuera del mapa cerrado y eso exige disciplina
  documental; la poda es una operación manual que alguien debe recordar; el
  borrado de un dispositivo con activos queda bloqueado hasta que se decida su
  política.
- **Coste:** no medido. Estimación con supuestos explícitos: con 1.000 activos y
  ~1 KB por fila (JSONB `peers` y `protocols` pequeños), la tabla ocuparía del
  orden de 1–2 MB, muy por debajo de los 400 MB que disparan la alerta de
  capacidad. Es una estimación, no una medición: hoy hay 0 filas.

## Disparadores para revisar esta decisión

- La tabla supera 40 MB o el 10 % del tamaño de la base (umbral propuesto; el
  propietario decide el definitivo).
- Se habilita la poda automática de 180 días.
- Cambia la página de privacidad o la retención prometida.
- Se implementa el borrado de dispositivos en el dashboard.
- Aparece el primer dataset OT real y se puede medir el crecimiento por activo y
  por mes.
