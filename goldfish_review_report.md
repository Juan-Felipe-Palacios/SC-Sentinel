# Goldfish — informe de revisión (estado corregido)

**Estado:** abierto. Quedan 4 decisiones del propietario; M6 OT se aprobó el
2026-11-25 con F1 en allowlist y los hallazgos de diseño se corrigieron en E0.

**Objetivo revisado:** `docs/designs/m6-passive-ot-identification.md` (588 líneas al
momento de la revisión).

**Alcance:** huecos identificados por el propietario durante la revisión del índice de
lectura (2026-11-25). No son hallazgos de subagentes Goldfish.

**Autoridad actual:** `docs/OT/plan-implementacion.md` §3 fija los valores correctos y
`docs/OT/seguimiento.md` registra el avance. Este informe queda como registro de la
revisión, no como fuente de verdad.

## Veredicto de los 8 hallazgos

| # | Hallazgo | Veredicto | Estado |
|---|---|---|---|
| 1 | `data-model.md` y `detection-rules.md` no contenían OT | Confirmado en parte | Se escribieron las secciones OT en E0; el cuarto nombre de regla era inventado (§1) |
| 2 | El ítem 7 remite a un DDL inexistente | Confirmado | Appendix B con el DDL de 24 columnas |
| 3 | No existen los 6 informes de revisión | Confirmado, no accionable | Auditarlos por diff es inviable: el diseño tiene un solo commit (`c1a8500`). Decisión del propietario |
| 4 | M6 OT está "Decisión pendiente" en el backlog | Confirmado | **Aprobado 2026-11-25** con F1 OT en allowlist (`backlog:49`); sigue el checkpoint E2.0/E2 |
| 5 | "F1" sobrecargado (DPI+blacklists vs fase 1 OT) | Confirmado | Decisión del propietario; default propuesto: nota, sin renombrar |
| 6 | `host_key` contradice B-029 | Confirmado | Alineado a B-029 y `identity_kind` eliminado |
| 7 | "16 en contrato vs 64 en `ot_max_endpoints`" | **No es defecto** | El propio diseño ya distinguía default y rango (`:60`); el riesgo real era otro (§7) |
| 8 | Rango de Appendix A mal citado | **No es defecto del documento** | El error estaba en el índice de lectura, no en el diseño |

## Detalle

### 1. Contenido OT en `docs/reference/`

`data-model.md` y `detection-rules.md` no tenían ninguna mención de OT: había que
**escribirlas**, no consultarlas. Hecho en E0.

Corrección al hallazgo: listaba cuatro reglas, una de ellas `ot_baseline_conversation`,
que **no existe** en el diseño. Las cinco reglas reales están en `:121-126` y son
`ot_new_master`, `ot_write_outside_hours`, `ot_program_download`, `ot_cpu_state_change` y
`ot_it_zone_crossing` (antes `ot_ot_in_it_zone`). El baseline es estado, no una regla.

### 2. DDL

El ítem 7 decía "schema completo, Appendix A", y Appendix A sólo contiene enums. Ahora
hay **Appendix B** con `CREATE TABLE ot_assets` de 24 columnas, `CHECK` de `vendor`,
`jsonb_array_length` de `protocols` (≤6) y `peers` (≤64), `octet_length(oui_prefix)=3`,
`UNIQUE(device_id, host_key)` y `fillfactor=80`.

Diferencias con el DDL propuesto originalmente en este informe: `id` es `text` (no
`uuid DEFAULT gen_random_uuid()`, porque el id lo deriva el servidor), `device_id` es
`text` (la clave de `devices` es text), no hay `identity_kind` (B-029) y se agregaron los
`CHECK` que faltaban.

### 3. Informes de revisión ausentes

Los seis informes no están en el repositorio y el diseño tiene **un solo commit**, así
que no hay versión previa contra la cual auditar los "22 fixes". Opciones para el
propietario: (a) aceptar el estado actual y seguir con `docs/OT/` como registro, (b)
re-ejecutar las etapas de revisión y persistir los informes, (c) documentar las
correcciones en un ADR. Sin decisión, el punto queda abierto.

### 4. Aprobación del milestone

`docs/plans/etapa-2-backlog.md:49` registraba "M6 OT (hito nuevo sí/no, allowlist vs
baseline)" como *Decisión pendiente*. El propietario aprobó M6 el 2026-11-25 con F1 OT
en **allowlist + descubrimiento manual**; el baseline automático queda para F1.5/F2. El
gate vigente es el checkpoint E2.0/E2, no la aprobación del hito.

### 5. "F1" sobrecargado

En el backlog, "Fase 1" es DPI + blacklists + watchlist (IT); en el diseño, "F1" es la
fase 1 de OT. Comparten etiqueta. Default propuesto: dejar el roadmap como está y añadir
la nota de desambiguación en el diseño; el renombre queda a decisión del propietario.

### 6. `host_key` e `identity_kind`

B-029 (`docs/plans/etapa-2-backlog.md:112`) fija `host_key` como HMAC en **ambos** modos y
aclara que no cambia al activar la anonimización. El diseño decía lo contrario. Se alineó
a B-029 y se eliminó `identity_kind`: con HMAC incondicional sería una columna con un
solo valor posible. `ip_display` sigue siendo el campo separado, con retención de 7 días.

### 7. Tope de endpoints

El hallazgo no era un defecto de documentación: `:60` ya decía "default 16, configurable
4–64". El problema real es que **64 endpoints no caben** en el presupuesto del bloque: se
corrigió el presupuesto a 8 KiB (§8, N1) y se dejó explícito que el tope efectivo son los
bytes, no el conteo.

### 8. Rango de Appendix A

Appendix A ocupa `406-502` y el plan de implementación empieza en `503`. El error de rango
estaba en el índice de lectura de la conversación, no en el diseño. No requiere edición.

## Hallazgos que este informe no incluía

Detectados al verificar el diseño contra el repositorio y la base (2026-11-25):

| # | Hallazgo | Corrección aplicada |
|---|---|---|
| N1 | El presupuesto de 4096 B era aritméticamente imposible: 8 eventos × 512 B ya lo agotaban, y con protocols y endpoints el peor caso es 7392 B | Cap 8192 B, tope por evento 384 B y tabla de peor caso |
| N2 | La ruta `web/db/migrations/` no existe | `web/lib/db/migrations/0017_ot-assets.sql` |
| N3 | La matriz asignaba `ot_program_download` y `ot_cpu_state_change` a Modbus TCP, donde no existen | Matriz corregida por protocolo |
| N4 | El set U-frame IEC-104 incluía `0x2B` (inválido) y omitía `0x23` | `{0x07, 0x0B, 0x13, 0x23, 0x43, 0x83}` |
| N5 | El ejemplo del snapshot incluía `"v": 1`, que viola `additionalProperties:false` | Quitado; `v` vive en el envelope |
| N6 | `OtEvent.evidence` tipada contra `Alert.evidence` (`Record<string,string>`, 1–32 claves) sin mapeo | Regla de serialización documentada |

## Abierto

1. **Nivel de auditoría** de los 6 informes ausentes (hallazgo 3).
2. **Desambiguar "F1"** (hallazgo 5).
3. **B-028**: rotación de `SC_HMAC_KEY` con discontinuidad aceptada o con versionado.
4. **Confirmar el renombre** `ot_ot_in_it_zone` → `ot_it_zone_crossing`.

M6 OT ya no está en esta lista: aprobado el 2026-11-25. El checkpoint E2.0/E2 se
evalúa al cerrar esas dos etapas y tampoco se resuelve por cuenta del agente.

Nada de esto se resuelve por cuenta del agente (AGENTS.md §13.7). El orden de ejecución
vigente está en `docs/OT/plan-implementacion.md` §4 y el estado en
`docs/OT/seguimiento.md`.
