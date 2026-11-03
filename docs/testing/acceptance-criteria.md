# Criterios de aceptación por hito (v1)

Fuente: spec §14.3. Cada hito cierra cuando TODOS los checks correspondientes pasan (y el checklist del `release-checklist.md` si aplica).

## M0 — Scaffold + CI (3–4 días)

- [ ] Repo con estructura completa del árbol §4 del spec (agent/, web/, docs/).
- [ ] Rust workspace compila en Windows y Linux (CI matrix verde).
- [ ] Next.js compila sin errores.
- [ ] CI básico verde: fmt, clippy, test, build (+ audits Rust).
- [ ] Licencias iniciales documentadas (THIRD_PARTY_NOTICES + headers en código heredado).
- [ ] Contratos skeleton creados y validables en CI.
- [ ] Diagramas C4 context/container iniciales creados.
- [ ] README con instrucciones de desarrollo local.

## M1 — Capture + aggregate + sync end-to-end (2 semanas)

- [ ] Captura real desacoplada de iced (eventos tokio mpsc).
- [ ] FlowUpdate por canal bounded con backpressure; drops reflejados en métricas.
- [ ] Ventanas de 30 s estables (golden tests).
- [ ] Spool SQLite soporta offline (reintentos, cota, FIFO).
- [ ] Mock server recibe batches idempotentes (duplicate aceptado).
- [ ] Métricas de drops/spool visibles en logs y en el health del snapshot.
- [ ] Compresión gzip funcionando; flag zstd compila (off por defecto).
- [ ] Smoke: tráfico real del propietario publicado end-to-end.

## M2 — API + Neon + dashboard v0 (1,5 semanas)

- [ ] `/api/ingest` valida con zod; errores 400 con JSON de problema.
- [ ] Token auth: Bearer + hash SHA-256; 401/403 según estado del device.
- [ ] Insert idempotente en Neon (duplicado → 200 duplicate; sin doble métrica).
- [ ] Rate limit activo (60/min burst 30 por device; 20/min por IP sin token).
- [ ] `/api/query` + dashboard overview con datos reales (SWR 5 s).
- [ ] Health del agente visible; alertas operativas automáticas.
- [ ] Cron de cleanup corre automáticamente (log de espacio liberado).

## M3 — Landing + tokens + IA (1,5 semanas)

- [ ] Landing pública publicada en sc-sentinel.vercel.app (/, /funcionalidades, /contacto, /legal/*, /security).
- [ ] Design tokens de strategicconnex.com.ar aplicados (landing + dashboard, un solo sistema en lib/).
- [ ] Panel IA con insights: summary, risk_level, findings, recommendations; muestra modelo usado y estado.
- [ ] IA fallback agotado → `degraded` probado (no error de producto).
- [ ] Legal/privacy/notices publicados.
- [ ] SEO básico + analytics activo.

## M4 — sc-collector MikroTik/Cisco (1,5 semanas)

- [ ] IPFIX/NetFlow recibe tráfico real de router MikroTik (y Cisco si hay hardware).
- [ ] Topología IPFIX documentada (`diagrams/drawio/network-topology-ipfix.drawio` actualizada).
- [ ] Fixtures de collector (paquetes de muestra, sin datos sensibles).
- [ ] Diferencias pcap vs flow documentadas (sampling, timeouts, bytes por paquete).
- [ ] Marca la agregación de windows de la misma calidad que en capturas.

## M5 — Servicio + instalador + GUI (1–2 semanas)

- [ ] Servicio Windows instala/desinstala limpiamente (sc.exe, sin residuos).
- [ ] Recovery automático: reinicio del servidor reinicia el daemon y el sync con el spool.
- [ ] Logs locales accesibles y sin datos sensibles (reglas §9.3).
- [ ] Config segura (permisos restrictivos a config y spool; token en env).
- [ ] Instalador documentado (runbook actualizado).
- [ ] GUI opcional separado del servicio (si aplica).
- [ ] Runbooks completos y verificados paso a paso contra una instalación real.
