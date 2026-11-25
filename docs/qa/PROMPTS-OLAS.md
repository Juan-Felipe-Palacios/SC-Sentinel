# Prompts de ejecución — Olas 0 y 1 (borradores, no ejecutados)

Cada prompt se pega en una sesión nueva. No autoriza nada por sí solo: el propietario debe dar el OK a cada punto en el mensaje actual. No se ejecutó ninguno.

---

## Ola 0A — Release 0.1.10 por CI verde y reinstalación verificada

```
TAREA: ejecutar 0A de docs/qa/PLAN-DE-SOLUCION-2026-11-21.md.

AUTORIZACIÓN POR PUNTO (el propietario debe decir "dale" a cada uno):
- A1: commits locales, tag v0.1.10 y push a main/tag.
- A2: release en GitHub (gh release create).
- A3: reinstalar el agente y la GUI en este equipo con el script oficial
      (deploy-agent-service.ps1 / instalar-sc-sentinel.bat).
- A4: desplegar la web solo si 0A incluye el anuncio de versión.

FRENOS DUROS:
- No reemplazar assets de v0.1.9; si el artefacto cambia, versión nueva.
- No imprimir .env*, tokens, cookies ni valores del registro.
- No tocar producción ni el servicio sin git status limpio y gates verdes.
- No usar vercel --prod desde un árbol con commits sin empujar.
- Si el hash instalado no coincide con el ZIP, DETENTE y reporta.

ALCANCE:
1. Worktree limpio de origin/main; corregir el runbook que cita 0.1.8;
   compilar agente y GUI desde el mismo árbol.
2. CI release Windows+Linux; empaquetar; verificar SHA de agente y GUI
   contra el ZIP; publicar 0.1.10; descargar los assets publicados y ejecutar
   verify-agent.ps1 sobre el ZIP descargado.
3. Reinstalar agente y GUI con el script oficial; comparar hash instalado
   vs hash del ZIP descargado; comprobar VersionInfo no vacío.
4. Probar «Salir» en la GUI instalada (no en el build local).
5. Añadir 0.1.10 a releases.ts/product-facts.ts o declarar release solo-agente.

PRUEBAS:
- gh run list --workflow=release.yml: success.
- verify-agent.ps1 -ZipPath <asset descargado> -Service: TODO CORRECTO.
- Get-FileHash de sc-gui.exe instalado == ZIP.
- Get-Process sc-gui tras «Salir»: sin proceso.
- curl /novedades y /status: misma versión (o nota de solo-agente).

REVERSIÓN:
- Agente: deploy-agent-service.ps1 -Mode Rollback con el .bak verificado.
- Web: redeploy del deployment anterior.
- Release: no borrar la anterior; publicar 0.1.11 si hay que corregir.

IMPACTO EN PLANES GRATUITOS: un release más; sin costo adicional.

PUERTA DE SALIDA: CI verde; verify-agent TODO CORRECTO; hash instalado == ZIP;
GUI instalada probada; web y agente con la misma versión o excepción documentada.
```

---

## Ola 0B — CSP P3–P5 (Report-Only → enforce)

```
TAREA: ejecutar 0B de docs/qa/PLAN-DE-SOLUCION-2026-11-21.md.

AUTORIZACIÓN POR PUNTO:
- B1: leer reportes de CSP de Preview y producción (solo lectura).
- B2: corregir violaciones en código y desplegar Preview.
- B3: CSP_ENFORCE=1 en Preview y observar 48 h.
- B4: CSP_ENFORCE=1 en Producción, con ventana de reversión.

FRENOS DUROS:
- No enforce en producción sin 48 h de Preview y PR #8 resuelto.
- No tocar auth/dashboard sin probar login, logout y Trust Pages.
- Si hay violaciones en 3xx o en el dashboard, volver a Report-Only y reportar.

ALCANCE:
1. Analizar dos fuentes: reportes de producción (Report-Only) y de Preview.
2. Corregir las violaciones reales (Analytics, estilos inline, Trust Pages).
3. Enforce en Preview 48 h; revisar consola y endpoints.
4. Enforce en Producción; verificar cabecera y consola limpia.

PRUEBAS:
- curl -sSI https://sc-sentinel.vercel.app/: Content-Security-Policy (no Report-Only).
- login/logout, /dashboard/overview, /dashboard/alerts, /p/<token>, /demo.
- 0 violaciones nuevas en consola; 3xx conservan la cabecera.

REVERSIÓN: CSP_ENFORCE=0 y redeploy; la política Report-Only sigue disponible.

IMPACTO EN PLANES GRATUITOS: sin costo.

PUERTA DE SALIDA: enforce estable 48 h en Preview y verificado en Producción.
```

---

## Ola 0C — Rotación de secretos (la ejecuta el propietario)

```
TAREA: ejecutar 0C de docs/qa/PLAN-DE-SOLUCION-2026-11-21.md.

AUTORIZACIÓN: N4. Solo el propietario ejecuta la creación/revocación en las
consolas. El agente puede leer el runbook y verificar, pero nunca ve valores.

FRENOS DUROS:
- No pegar valores en el chat, en logs ni en el repositorio.
- No rotar DATABASE_URL ni el token del dispositivo sin ventana de ingesta.
- No rotar SC_HMAC_KEY sin aceptar que cambia host_key de todos los hosts.
- Si la ingesta/cron/chat falla, conservar la credencial vieja hasta reparar.

ORDEN:
1. Token de dispositivo: rotar desde el dashboard; actualizar el agente;
   verificar una ventana ingerida.
2. DATABASE_URL: crear rol/clave nueva en Neon; actualizar Vercel; desplegar;
   verificar lectura/escritura; revocar la vieja.
3. ADMIN_SECRET y SC_SESSION_SECRET: generar nuevos; desplegar; verificar
   login/logout; las sesiones viejas deben quedar inválidas.
4. CRON_SECRET: generar; actualizar Vercel y el secret de GitHub Actions;
   ejecutar workflow_dispatch del cron y verificar 200.
5. GEMINI/GOOGLE_AI, OPENROUTER y GROQ: crear claves nuevas; actualizar Vercel;
   verificar cron y chat; revocar las viejas en cada proveedor.
6. TRUST_ALERT_WEBHOOK_URL: regenerar el webhook; verificar alerta de prueba;
   revocar el anterior.
7. Borrar VERCEL_OIDC_TOKEN de web/.env.local y cualquier .env.production.local
   con credenciales, tras confirmar que producción no lo necesita.
8. Registrar fecha, operador y qué se rotó (sin valores) en
   docs/runbooks/secret-rotation.md.

PRUEBAS:
- /api/ingest acepta una ventana de prueba y la escribe.
- /api/ai/cron responde 200 con el CRON_SECRET nuevo.
- /api/chat responde con el proveedor esperado.
- Login admin y logout funcionan.
- Las credenciales viejas fallan (401/403) tras revocarlas.

REVERSIÓN: mantener la credencial vieja activa hasta que la nueva pase todas
las pruebas; si falla, volver a la vieja y reportar.

IMPACTO EN PLANES GRATUITOS: sin costo; las claves nuevas consumen la misma cuota.

PUERTA DE SALIDA: todas las credenciales rotadas y registradas; viejas revocadas;
ingesta, cron, chat y login verificados.
```

---

## Ola 1 — Datos e IA

```
TAREA: ejecutar la Ola 1 de docs/qa/PLAN-DE-SOLUCION-2026-11-21.md.

AUTORIZACIÓN:
- N1: commits locales y tests.
- N3: migración aditiva en Neon (rama primero) y deploy web.

FRENOS DUROS:
- No escribir en producción sin migración probada en rama y reversión documentada.
- No ejecutar el cron de IA con CRON_SECRET.
- No usar datos reales de clase C en pruebas; usar PGlite/fixtures.
- No imprimir filas con host_key/IP completas.

ALCANCE:
1. B-003: en /api/chat, si el device es sintético, construir el contexto desde
   synthetic*() o devolver un aviso explícito "demo sin datos reales"; añadir
   test que garantice que no se consulta la base para el device demo.
2. B-007: migración aditiva para FK/limpieza de huérfanos; test de retención.
3. B-008/B-009: marcar ventanas vacías con motivo; separar paquetes capturados
   vs atribuidos y packets_in/out; actualizar etiquetas; documentar host always-on.
4. B-010: umbral de alertas, expiración y resumen; probar acknowledge/resolve.
5. B-011/B-031: persistir status degraded/error con código y modelo; registrar
   el status del proveedor en el chat; alerta de tasa de fallo.
6. B-030: fijar AI_PROVIDER por entorno o documentar Groq como primario.
7. B-029: decidir política de anonymize_hosts y probar ip_display=null.

PRUEBAS:
- 12 preguntas al chat demo: ≥11/12 exactitud contra ground truth sintético.
- SQL: 0 huérfanos; ventanas vacías con motivo.
- pnpm test / typecheck; cargo test.
- Test de fuga clase C: 0 IPs en prompt/respuesta con anonymize=true.

REVERSIÓN:
- Migración con down documentado; restaurar rama.
- Revertir commits de UI por separado.

IMPACTO EN PLANES GRATUITOS: una migración; sin costo de IA adicional si el
chat demo no llama al proveedor.

PUERTA DE SALIDA: chat demo correcto; 0 huérfanos; etiquetas de paquetes
correctas; alertas con triage; errores de IA visibles; política de IP decidida.
```
