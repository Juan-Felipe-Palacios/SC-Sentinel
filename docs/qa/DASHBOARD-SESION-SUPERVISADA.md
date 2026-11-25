# Dashboard real — sesión supervisada (procedimiento, sin ejecutar)

**Estado:** diseñado, **no ejecutado**. Requiere que el propietario inicie sesión y autorice la instalación de la herramienta. No se instaló nada.

**Objetivo:** verificar con sesión de administrador lo que la ronda 1 no pudo: `/api/query` vs SQL, y los valores visibles en la UI (Overview, Hosts, Alertas, IA) a 1440 y 390 px. No se usan credenciales del propietario en el script: él las escribe en el navegador.

---

## 1. Herramienta recomendada

| Opción | Licencia | Descarga | Dónde se instala | Veredicto |
|---|---|---|---|---|
| **`playwright-core`** | Apache-2.0 | Paquete npm ≈ 3 MB; **no descarga navegadores** | `web/node_modules/playwright-core` | **Recomendada**: usa el Edge/Chrome ya instalado |
| `playwright` completo | Apache-2.0 | Paquete + Chromium ≈ 170 MB | `web/node_modules` + `%LOCALAPPDATA%\ms-playwright` | Innecesaria para una sesión |
| Selenium + driver | Apache-2.0 | Driver por navegador | `web/node_modules` | Más piezas; no aporta |

**Navegador:** Edge ya está en `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`; Chrome en `C:\Program Files\Google\Chrome\Application\chrome.exe`. El script detecta Edge y permite `BROWSER_PATH`.

**Instalación pendiente de OK (no ejecutar todavía):**

```bash
cd web
pnpm add -D playwright-core
```

Esto modifica `web/package.json` y `web/pnpm-lock.yaml`. Si el propietario prefiere no tocar el proyecto, se puede instalar en una carpeta temporal fuera del repo y borrarla al terminar; el script acepta `PLAYWRIGHT_CORE_PATH`.

---

## 2. Procedimiento

1. **Autorización:** el propietario dice «OK, instalá playwright-core» (o elige la carpeta temporal).
2. **Instalar** solo ese paquete; no `playwright install`.
3. **Ejecutar** desde la raíz del repo:

   ```bash
   node docs/qa/scripts/captura-dashboard.mjs
   ```

4. El script abre Edge headed en `https://sc-sentinel.vercel.app/login`.
5. **El propietario inicia sesión manualmente** (usuario/contraseña o el método habitual). El agente no ve ni pide credenciales.
6. Cuando el propietario pulse Enter en la terminal, el script comprueba que la URL esté en `/dashboard`; si sigue en `/login`, aborta sin capturar.
7. Recorre, para cada ruta, 1440×900 y 390×844:
   - `/dashboard/overview`
   - `/dashboard/hosts`
   - `/dashboard/alerts`
   - `/dashboard/ai`
8. Guarda `shot-<ruta>-<ancho>.png` y `texto.json` en `docs/evidence/dashboard-<YYYYMMDD-HHmm>/`.
9. Cierra el navegador. No guarda cookies, storage ni perfil.

**Salida esperada:** 8 capturas + 1 JSON. El JSON contiene el texto visible (puede incluir IPs de clase C); por eso va a `docs/evidence/`, que está ignorado por git.

---

## 3. Qué se verifica después

| Comprobación | Cómo |
|---|---|
| Overview vs SQL | `packets_in`, bytes, ventanas, hosts, alertas del mismo rango |
| Hosts | total, orden, IP vs `host_key`, paginación |
| Alertas | 428 abiertas, severidades, filtros, estados |
| IA | modelo, estado, latencia, coste, último insight |
| Responsive | 390 px sin overflow horizontal ni tablas cortadas |
| Consola/red | 0 errores 5xx, 0 violaciones CSP nuevas, assets 200 |
| Clase C | si `anonymize_hosts=false`, la UI muestra IP; registrarlo como decisión, no como bug |

**Criterio de cierre:** diferencias API/UI explicadas por redondeo o por semántica documentada; 0 diferencias sin explicar; 0 errores de consola.

---

## 4. Frenos

- No ejecutar contra producción con escrituras: solo navegación y lectura.
- No descargar el perfil del navegador ni exportar cookies.
- No guardar capturas con IPs fuera de `docs/evidence/`.
- No instalar `playwright` completo si `playwright-core` + Edge alcanza.
- Si el login falla o hay MFA, detenerse y pedir al propietario que lo resuelva en la ventana.

---

## 5. Alternativa sin instalar nada

El propietario puede hacer la sesión en su navegador y entregar capturas manuales 1440/390 de las cuatro rutas. El script existe para reducir trabajo y producir un JSON comparable, no para reemplazar su criterio.
