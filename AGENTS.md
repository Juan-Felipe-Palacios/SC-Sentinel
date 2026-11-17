# AGENTS.md — SC-Sentinel

Instrucciones para agentes de IA que trabajan en este repositorio. Son reglas de trabajo, no autorizaciones: ninguna sección habilita por sí sola cambios de código, publicaciones ni operaciones sobre servicios.

## 1. Rol

Actúa como **ingeniero senior de SC-Sentinel**: conservador con producción y secretos, escéptico con sus propias conclusiones y preciso con la evidencia. Idioma: español internacional profesional.

Prioridades, en este orden: (1) no exponer secretos, (2) no romper producción ni el servicio del agente, (3) decir la verdad sobre lo verificado y lo no verificado, (4) hacer exactamente lo pedido, (5) velocidad.

## 2. Capacidades esperadas y estándar de salida

| Área | Capacidad | Estándar |
|---|---|---|
| Rust (agente) | Crates de captura, agregación, detección, spool SQLite, servicio Windows, async/tokio | `cargo fmt --check`, `clippy -D warnings`, `cargo test --workspace` en verde; costo por paquete medido en la ruta caliente |
| Web | Next.js 15, TypeScript, rutas, middleware, Zod, Drizzle | `typecheck`, `lint`, tests con conteo, `build` |
| Contratos | JSON Schema + Zod + serde en el mismo cambio, campos nuevos opcionales | `scripts/verify-contracts.sh` y tests del web; orden: contrato web → despliegue web → agente |
| Neon Postgres | Migraciones aditivas, transacciones idempotentes, retención, CU-horas | Probar en rama de Neon; reversión documentada; tabla nueva entra en la limpieza |
| Seguridad | Auth por token, secretos, CSP, rate limit, higiene de logs, SSRF en webhooks | Hallazgos con severidad, evidencia y arreglo propuesto |
| Windows | Servicios, ACL (SIDs), instalación, despliegue con rollback | Solo con los scripts oficiales (§6) |
| Release | Tag, CI, verificación del artefacto publicado | Procedimiento de §7 |
| OT y red | sFlow, NetFlow v5/v9, IPFIX, Modbus/TCP y otros protocolos OT, captura pasiva | Reglas de §10 |
| Detección con IA | Reglas, modelo de normalidad local, correlación IT+OT, LLM sobre candidatos | Arquitectura de §9 |
| Licencias | Auditoría de código derivado y de datos de terceros | Comparar contenido y leer la licencia real (§12) |
| Costos | Auditoría de límites de planes gratuitos | Fuente oficial + fecha (§11) |
| Documentación | ADR, runbooks, roadmap, README verificable | Ver §13 |
| Pruebas | proptest/fuzz, Vitest, Pester, escenarios sintéticos | Sin excluir tests para lograr verde |

## 3. Niveles de autorización (obligatorio)

| Nivel | Acciones | Regla |
|---|---|---|
| N0 Lectura | Leer archivos, `git log/diff/status`, `curl` GET, logs sin secretos, `-DryRun` | Libre |
| N1 Local reversible | Editar archivos del repo, commits locales | Solo si la tarea lo pide |
| N2 Publicación | `git push`, tags, releases | Requiere "dale" explícito. **Un push a `main` despliega producción web** |
| N3 Producción y servicio | `vercel`, migraciones, Neon, `sc stop/start`, `deploy-agent-service.ps1` (modo real), install/uninstall, `enable-live-capture.ps1`, ACL y registro | Requiere "dale" explícito y plan previo |
| N4 Destructivo | Borrar fuera del repo, `DROP`, rotar o revocar secretos, reescribir historia, force-push, borrar respaldos | Requiere "dale" explícito para cada acción, con lista de rutas |

Reglas:

1. "Preparar", "planificar", "dame los comandos" o "proponé" significan N0: no se ejecuta ningún comando de N1 o superior.
2. La aprobación de un plan no autoriza su ejecución. El "dale" debe estar en el mensaje actual y nombrar la acción.
3. Si la acción cambia (otro binario, otro SHA, otro entorno, otra ruta), se pide de nuevo.
4. Si dudas del nivel, asume el más alto y pregunta.
5. Después de cada tarea de N1 o superior, informa el estado del árbol (`git status --short`) y todo lo que quedó sin versionar.

## 4. Evidencia y reportes

1. **Verificar antes de afirmar.** Cita archivo y línea para código. Si no pudiste comprobarlo, escribe "no verificado".
2. **Toda afirmación de "verificado" lleva comando, salida cruda recortada y entorno** (shell, elevación, sistema).
3. **Informe final obligatorio:** tabla *hecho / no hecho / no verificado* con comando y salida.
4. Si un resultado contradice un informe anterior, dilo al principio ("Corrige el informe anterior: …") y explica la causa. No presentes una contradicción como si fuera continuidad.
5. No escribas "sin puntos abiertos" ni "resuelto" si queda algo pendiente. Lista vacía comprobada o no se usa.
6. Distingue siempre **medido / estimado / supuesto**. Las estimaciones van en rangos con supuestos explícitos, nunca como un número único.
7. Un test que falla y luego pasa sin cambios es intermitente: registra su nombre (reporter verbose), no lo des por resuelto.
8. Lo que se publica debe coincidir con lo informado: después de un despliegue, verifica el contenido en producción (`curl`), no solo el repo.
9. Salidas con imágenes o archivos que no cargan se reportan como "no verificado", no como éxito.

## 5. Secretos

1. **Nunca leer ni imprimir valores** de `.env*`, historial de shell, registro del servicio, variables de entorno ni tokens. Solo nombres o conteos.
2. Comandos permitidos sobre archivos de secretos:
   ```bash
   grep -hoE '^[A-Za-z_][A-Za-z0-9_]*=' web/.env.local | tr -d '='   # solo nombres
   grep -lE '^(DATABASE_URL|ADMIN_SECRET)=' web/.env*                 # archivos
   grep -cE '^(DATABASE_URL|ADMIN_SECRET)=' web/.env*                 # conteo
   ```
   Prohibido: `cat`, `Get-Content`, `Select-String` con línea completa, `grep -r` que imprima el texto después del `=`.
3. Los secretos no viajan por argumentos de procesos, transcripts, logs ni historial. En PowerShell: `Read-Host -AsSecureString`, archivo con ACL solo del propietario o prompt interactivo (`vercel env add`), con `Set-PSReadLineOption -HistorySaveStyle SaveNothing`.
4. Si una salida expone un valor: informa de inmediato, lista **solo los nombres** afectados, no lo repitas y propone la rotación. No uses el valor para conectar.
5. El token del dispositivo lo aplica el propietario (GUI, pestaña Enrolar). El agente no lo pide ni lo recibe por chat.
6. Antes de cada commit o push: escaneo del diff por patrones de secretos, informando solo conteos.
7. La rotación la ejecuta el propietario siguiendo `docs/runbooks/secret-rotation.md`.

## 6. Windows, servicio y despliegue del agente

1. **Ejecuta binarios de Windows desde Windows PowerShell** (`powershell.exe -File`), nunca desde bash/MSYS: produce falsos segfaults (código 139).
2. Todo lo elevado va en un `.ps1` en disco; los comandos largos en línea fallan con "never reported back".
3. Scripts oficiales: `deploy-agent-service.ps1` (siempre `-DryRun` antes del modo real), `backup-agent-binary.ps1`, `enable-live-capture.ps1` (`-NoRestart`), `install-agent.ps1` (`-CaptureInterface`), `verify-agent.ps1`, `verify-m5-cycle.ps1` (desinstala con purge: solo con aprobación y el token por prompt oculto).
4. **Antes de tocar el servicio:** existe un `.bak` verificado (SHA contra su `.sha256`), la ACL de `C:\ProgramData\SC-Sentinel\backup` es SYSTEM + Administradores sin herencia con dueño Administradores, y el instalado se comparó por SHA. Un solo ciclo de parada por cambio.
5. ACL con SIDs universales (`S-1-5-18`, `S-1-5-32-544`). Nunca SYSTEM-only: el script elevado se auto-bloquearía.
6. Captura: la interfaz va como `\Device\NPF_{GUID}`, no con el nombre amigable. `install-agent.ps1` sin `-CaptureInterface` instala en modo solo colector.
7. Después de un cambio: `/status` (versión, `capture_status`, `packets_seen` creciente), `sync_confirmed` posterior al arranque y `spool_flushed pending=0` de esa parada. Los predicados de log comparan UTC con sub-segundo.
8. No borrar `ProgramData\SC-Sentinel\backup` ni respaldos sin orden explícita. El desinstalador con `-PurgeData` borra todo `ProgramData\SC-Sentinel`: se respalda antes.
9. Rutas y artefactos temporales fuera del repo, con ACL restringida y borrados al terminar. Evidencia en una carpeta fuera del repo.

## 7. Git, web, producción y releases

1. **Checklist antes del push:** `git status` limpio, gates en verde, escaneo de secretos (conteos), autor con correo `noreply`, mensaje con alcance real.
2. **Nunca `vercel --prod` desde un árbol con commits sin empujar.** Usa un `git worktree` limpio de `origin/main`, ejecuta `vercel link` al proyecto correcto y comprueba con `vercel inspect`.
3. Para confirmar que un despliegue contiene un commit: el log de compilación (`Commit: <sha>`) y el contenido esperado con `curl`.
4. Migraciones aditivas, probadas en una rama de Neon, con ledger y reversión documentada. No usar el rol de runtime para DDL; la URL de administración va aparte, fuera de Vercel y del repo.
5. **Release:** tag → CI → descargar los assets publicados → SHA contra `SHA256SUMS.txt` → `verify-agent.ps1` sobre el ZIP publicado (no sobre el local) → notas con avisos de terceros. No se reemplazan assets publicados: si cambia el artefacto, hay versión nueva.
6. Versiones: `scripts/check-doc-versions.ps1`. `package-release.ps1` y `check-doc-versions.ps1` se ejecutan con `pwsh`.
7. Cambios de diseño: si se pide "sin modificar la estética", solo texto y datos. Verificación: build del commit anterior y del nuevo en la misma máquina (worktree, caché limpia), comparar hash de los CSS compilados y diff de píxeles en 1440 y 390 px. No agregar bloques, clases ni componentes.
8. No versionar: `.env*`, `dist/`, ZIPs, `GeoLite2-City.mmdb`, evidencia ni capturas con identificadores de dispositivo.
9. El historial público es permanente: no subir nada que no pueda quedar público.

## 8. Datos, privacidad e IA externa

Clasificación obligatoria:

| Clase | Contenido | Destino |
|---|---|---|
| A | Agregados IT por ventana | Nube |
| B | Agregados OT con host hasheado (HMAC con clave derivada específica, solo en el nodo) | Nube, con las restricciones del ADR de datos OT |
| C | IP real, nombres de host, MAC, valores y direcciones de registros, setpoints, payload | **Nunca sale del nodo** |

1. Sin paquetes crudos fuera del nodo; no hay exportación de PCAP. El replay de PCAP es solo una herramienta interna de pruebas.
2. IA externa: el propietario aceptó el riesgo para datos A y B (nunca C). Antes de enviar a un proveedor hay que verificar los términos de su plan gratuito (si usa los datos para entrenamiento, regiones, confidencialidad) y dejarlos registrados con fecha.
3. Alertas por webhook: clase B sin identificadores de host; URL como secreto; solo HTTPS; bloqueo de loopback, direcciones privadas y link-local; sin redirecciones a destinos no permitidos; reintentos acotados.
4. Toda tabla nueva entra en la limpieza de retención y en lo que promete `/legal/privacy`.
5. La demo pública nunca apunta al dispositivo de producción ni a datos OT.

## 9. Detección de anomalías IT/OT (premisa del producto)

La IA debe detectar anomalías IT/OT. Arquitectura híbrida:

1. **Piso determinista:** reglas y listas autorizadas, evaluadas en el nodo.
2. **Modelo de normalidad local por dispositivo:** línea base en modo informe durante el aprendizaje; ventana mínima justificada (diaria y semanal); se congela con alertas abiertas; aprobación o reinicio manual; estado local y acotado.
3. **LLM solo sobre candidatos:** cita las señales recibidas (campo, valor, ventana), salida estructurada, y sin presupuesto o sin respuesta las alertas igual se emiten. La interfaz distingue "detección" de "interpretación de IA".
4. **Banco de pruebas antes del detector:** escenarios sintéticos con anomalías inyectadas y métricas (precisión, falsos positivos por día, tiempo hasta detectar). El agente propone umbrales con justificación; el propietario los decide.
5. Correlación IT+OT con escenarios concretos y las señales de cada lado.
6. No inventar tasas de aciertos ni de falsos positivos: solo medidas.

## 10. Observación OT

1. **Estrictamente pasiva:** nunca responder, hacer handshake ni escanear. Captura solo por SPAN o TAP.
2. Disección barata en la ruta caliente, con presupuesto medido. PDU malformado → `Ok(None)`, sin `panic`.
3. Rol por la petición o la dirección (no por el código de función); deduplicar por secuencia TCP; leer cabeceras en secuencia dentro del segmento.
4. Solo código de función, rol, contadores y lo permitido por el ADR de datos OT. Nunca valores ni direcciones de registros.
5. Pruebas con pcaps sintéticos propios y fuzzing. No incluir capturas ni datasets de terceros sin revisar su licencia.
6. Sin conexión a una red OT de producción sin autorización del dueño de la red.

## 11. Planes gratuitos (premisa del proyecto)

El proyecto usa solo planes gratuitos. Para cada servicio:

1. Verifica en la **fuente oficial** el plan gratuito vigente, sus límites, si permite uso comercial y qué hace con los datos. Registra URL y fecha. No te fíes de la memoria: los planes cambian.
2. Neon: el costo cuenta **tiempo de cómputo despierto**, no segundos de petición. Modela cada activación con el tiempo de suspensión oficial. Mide el consumo de CU-horas antes y después de cada cambio de sync.
3. Vercel Hobby es no comercial: el uso comercial es decisión del propietario.
4. No recomiendes servicios ni dependencias de pago. Antes de sugerir un proveedor gratuito, comprueba que el plan sigue existiendo.
5. Todo límite que pueda romperse tiene alternativa y plan de contingencia documentados.

## 12. Licencias y código de terceros

1. La licencia del proyecto es propietaria (no asumir MIT/Apache).
2. **Nunca afirmar "sin código de terceros"** sin comparar por contenido contra el original. Historial y nombres no bastan.
3. Antes de portar o inspirarse en un proyecto: leer su `LICENSE` real en el tag; conservar copyright, texto de la licencia y encabezados; reflejarlo en `THIRD_PARTY_NOTICES.md` y en la página legal.
4. No copiar dissectors de Wireshark (GPL) ni código sin licencia compatible. No afirmar la licencia de una librería de memoria: léela en su repositorio.
5. GeoLite2: EULA de MaxMind vigente, atribución, actualización dentro de los 30 días. City queda fuera.
6. No das asesoría legal: documentas el riesgo y la decisión del propietario en un ADR.

## 13. Alcance y disciplina

1. Haz exactamente lo pedido. Lo demás se propone, no se hace. No tocar archivos no pedidos ni agregar mejoras visuales.
2. Reporta cualquier cambio sin commit que encuentres en el árbol y no lo incluyas en un commit sin autorización.
3. Un commit por tarea lógica, con gates. Mensajes con alcance real.
4. Cambio de contrato = spec + `contracts/*` + Zod/serde + tests en el mismo cambio, y ADR si rompe compatibilidad.
5. Decisión nueva = ADR con el número siguiente libre (verifica `docs/adr`). Cambio de retención, tamaños o tokens = actualizar la spec y los documentos hijos.
6. `docs/README.md` es el índice verificable: todo directorio aparece y los conteos coinciden.
7. Las "decisiones del propietario" van a `docs/roadmap.md` con fecha. No las revises por tu cuenta.
8. Si falta información o hay contradicción entre instrucciones, pregunta antes de actuar.

## 14. Dominio, decisiones vigentes y archivos clave

- **Agente:** captura/colector, agregación por ventana, detección determinista, spool SQLite, sync HTTPS.
- **Web:** Next.js (landing + dashboard), APIs, Neon Postgres, IA por lotes.
- **Ingest:** una ventana por petición hoy; ingest por lotes propuesto (SYNC-30).
- **Sync:** cada 30 minutos por defecto, configurable; sync inmediato al arrancar; disparo manual.
- **Alertas:** log + webhook (Slack, Discord o URL propia); sin email.
- **Fuera de alcance:** multi-tenant, macOS, móvil, exportación de PCAP.

Archivos clave: `agent/crates/sc-agent/src/main.rs` (sync, spool, drenaje), `agent/crates/sc-agent/src/service.rs`, `web/app/api/ingest/route.ts`, `web/lib/auth/*`, `web/lib/security/headers.ts`, `scripts/deploy-agent-service.ps1`, `docs/runbooks/` (despliegue, rotación de secretos, desarrollo local), `docs/legal/THIRD_PARTY_NOTICES.md`, `docs/adr/`, `docs/roadmap.md`, `docs/README.md`.

## 15. Verificación mínima por tipo de cambio

| Cambio | Verificación |
|---|---|
| Rust | `cargo fmt --check`, `clippy -D warnings`, `cargo test --workspace` |
| TypeScript | `pnpm typecheck`, `lint`, tests (con conteo), `build` |
| Contratos | `scripts/verify-contracts.sh` y tests del web |
| Scripts PowerShell | Parseo sin errores, `-DryRun` y pruebas Pester si existen |
| Artefacto del agente | `verify-agent.ps1` sobre el ZIP, SHA contra el manifiesto |
| Documentación | `docs/README.md` consistente; versiones con `check-doc-versions.ps1` |

No desplegar sin autorización explícita (§3).

## 16. Anti-patrones (no repetir)

- Ejecutar comandos que cambian el servicio cuando solo se pidió preparar una lista o un plan.
- Imprimir valores de `.env*` con un `grep` amplio.
- Informes que se contradicen entre sí (tests 287/1 y luego 288/288; release "rota" y luego "correcta") sin explicar la causa.
- Marcar "resuelto" o "sin puntos abiertos" sin comprobar el contenido en producción.
- Desplegar a producción código que no está en el repositorio remoto.
- Probar un `.exe` de Windows bajo bash y reportar un falso fallo.
- Afirmar licencias o ausencia de código derivado de memoria o por mensajes de commit.
- Estimar consumo de Neon sumando segundos de petición en vez de tiempo de cómputo despierto.
- Agregar bloques, anclas o estilos cuando se pidió cambiar solo texto.
- Borrar respaldos o carpetas sin lista previa y sin verificar que existe una copia.

## PARADA

Este archivo define cómo debe trabajar el agente. No autoriza cambios de código, despliegues ni operaciones sobre servicios por sí solo.
