# ADR-0016 — Endpoint de estado loopback (`/status`) para la GUI

- Estado: aceptada (2026-11-12)
- Contexto: M5 backlog §19 (GUI opcional). `sc-gui` necesita datos sin leer el
  registro ni el spool del servicio (que son de SYSTEM y Administradores).

## Decisión

1. **Dónde vive**: módulo `status` en `sc-telemetry` (una lib), no en el binario.
   Así las pruebas cubren serialización, bind y HTTP sin levantar el agente.
2. **Servidor HTTP: `hyper` 1.x** (con `hyper-util::rt::TokioIo` y
   `http-body-util::Full`), no `axum`. Razones:
   - `hyper` ya está en el `Cargo.lock` por `reqwest`, así que no entra ningún
     árbol nuevo de dependencias ni cambia la auditoría de licencias;
   - `axum` habría traído `tower`/`tower-http` para una única ruta fija;
   - el contrato es un `GET /status` con JSON: no hay routing, extractores ni
     middleware que justifiquen un framework.
3. **Solo loopback, fijo en `127.0.0.1:8387`**: `StatusServer::bind` devuelve
   `StatusError::NotLoopback` para cualquier dirección que no sea loopback
   (incluida `0.0.0.0`), así que no puede publicarse por error en la red. No hay
   autenticación porque el socket no sale del equipo; el puerto es fijo para que
   la GUI no tenga que descubrirlo.
4. **Sin secretos**: el JSON publica `device_id` pero nunca el token, la URL de
   ingesta ni la clave HMAC. Hay una prueba que falla si aparece `token` o un
   prefijo `sc_dev_`.
5. **`service_state` = `running`**: el endpoint solo responde mientras el agente
   corre, así que no puede informar `STOPPED`. La GUI consulta el SCM con
   `QueryServiceStatus` (F3) y usa la ausencia de respuesta como "Desconectado".
   Se documenta para que nadie interprete ese campo como la verdad del SCM.
6. **Rutas**: `GET /status` → 200; `POST /status` → 405; cualquier otra ruta →
   404 con `{"error":"not_found"}`. `cache-control: no-store`.
7. **Fallo al abrir el puerto no tumba el agente** (se registra
   `status_server_failed`): perder la GUI es mejor que perder la captura.

## Consecuencias

- La GUI no necesita privilegios para mostrar estado; el enrolamiento sigue
  necesitando UAC porque escribe el `Environment` del servicio.
- El contrato queda como JSON estable en snake_case; agregar campos es
  compatible, quitarlos no.
- MSRV del workspace (1.75) se mantiene: `hyper` 1.x y `http-body-util` 0.1 lo
  respetan. `sc-gui` sí sube su propio `rust-version` por `eframe` 0.27 (ver
  ADR-0017).
