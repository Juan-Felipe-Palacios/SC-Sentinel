# OT — ejecución del milestone M6 (identificación pasiva)

**Qué es esto:** la colección operativa del milestone M6 (identificación pasiva de
protocolos OT: Modbus TCP, S7comm, DNP3, IEC 60870-5-104). No es un diseño ni una
spec: es el **plan de ejecución con estado**, pensado para que cualquier agente lo
tome sin depender de una conversación previa.

**Qué no es:** no reemplaza a `docs/designs/m6-passive-ot-identification.md` como
descripción del sistema; lo **corrige y lo ejecuta**. Tampoco autoriza nada: el
nivel de autorización de estos documentos es **N0** (lectura).

## Orden de lectura

1. [`plan-implementacion.md`](plan-implementacion.md) — qué se va a hacer, por qué,
   sobre qué hechos medidos y con qué correcciones respecto del diseño.
2. [`seguimiento.md`](seguimiento.md) — qué falta, qué está bloqueado, quién lo
   tocó y con qué evidencia.

## Protocolo para cualquier agente

1. Leer `seguimiento.md` y elegir **una** etapa en estado `pendiente` cuyas
   dependencias estén en `hecho` (o en `—`, si no tiene).
2. Cambiar el estado a `en curso` **antes** de empezar, con fecha y nombre del
   agente en la columna `Actualizado`.
3. Ejecutar **sólo** el alcance de esa etapa. Lo que no está listado en la fila no
   se hace, aunque parezca una mejora obvia: se propone.
4. Verificar con el comando exacto que figura en la fila y pegar la salida real
   (recortada) en la columna `Evidencia`, junto con el entorno.
5. Marcar `hecho` **sólo** si la columna `Evidencia` tiene comando + resultado. Si
   algo falla o queda pendiente: `bloqueado` + motivo. Nunca escribir "resuelto"
   ni "sin puntos abiertos" si queda algo abierto (AGENTS.md §4.5).
6. Si un resultado contradice una fila o una entrada anterior de la bitácora,
   decirlo **al principio** de la nueva entrada con la fórmula "Corrige el informe
   anterior: …" y explicar la causa (AGENTS.md §4.4).
7. Al terminar una etapa, agregar una entrada a la bitácora con el formato fijo de
   `seguimiento.md`. Sin entrada de bitácora, la etapa no se considera cerrada.

## Niveles de autorización

Estos documentos son **N0**. Nada de lo que dicen habilita cambios por sí solo:

| Acción | Nivel | Requisito |
|---|---|---|
| Leer, revisar, `--dry-run` | N0 | Libre |
| Editar `docs/`, tests locales, rama local | N1 | "dale" explícito nombrando la etapa |
| `git push`, tag, release | N2 | "dale" explícito; un push a `main` despliega la web |
| Migración aplicada a Neon, `vercel`, servicio del agente | N3 | "dale" explícito **y** plan previo |
| `DROP`, borrar respaldos, rotar secretos | N4 | "dale" explícito **para cada acción**, con lista de rutas |

La aprobación de un plan **no** autoriza su ejecución: el "dale" tiene que estar en
el mensaje actual y nombrar la acción (AGENTS.md §3.2). Si la acción cambia —otro
binario, otro SHA, otro entorno, otra ruta— se pide de nuevo.

## Prohibiciones explícitas

- `drizzle-kit generate`, `drizzle-kit migrate` y `drizzle-kit push` en este repo.
  El único ledger de migraciones es `sc_schema_migrations` (ver
  `plan-implementacion.md` §5).
- Aplicar cualquier migración a la Neon de producción sin autorización N3.
- Borrar `drizzle.__drizzle_migrations`: es N4 y requiere lista de rutas.
- Leer o imprimir valores de `.env*`; sólo nombres y conteos (AGENTS.md §5).
- Cualquier acción activa sobre una red OT: sondeo, handshake, envío de paquetes.
  El producto es 100 % pasivo (AGENTS.md §10.1).

## Convenciones de reporte

- **Medido / estimado / supuesto**: cada número se etiqueta. Las estimaciones van en
  rango con supuestos explícitos, nunca como un valor único.
- **Evidencia con archivo:línea** para código, y comando + salida para lo ejecutado.
- **Estado del árbol**: después de cada tarea N1 o superior, `git status --short` y
  la lista de lo que quedó sin versionar.

## Mantenimiento

- Una etapa nueva se agrega a la tabla de `seguimiento.md` **antes** de empezar, no
  después.
- Si una etapa se parte o se fusiona, se registra en la bitácora con el motivo.
- Los cambios de alcance que afecten contrato, retención o sizing se reflejan en
  `docs/designs/m6-passive-ot-identification.md` y, si corresponde, en un ADR
  (AGENTS.md §13.4, §13.5).
