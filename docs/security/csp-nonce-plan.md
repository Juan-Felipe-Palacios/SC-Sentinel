# Plan — CSP con nonce por request

Estado: **P1 implementado en código** (builder + middleware + root layout dinámico). Pendiente verificación manual en navegador/preview y fases P2–P5. Este documento planifica V3 del análisis
de seguridad; no cambia el comportamiento actual.

## Problema

La CSP global se sirve como cabecera estática desde `next.config.ts` y permite
scripts inline:

- `web/lib/security/headers.ts:11-14`: `script-src 'self' 'unsafe-inline'`
  (`'unsafe-eval'` también en desarrollo) y `style-src 'self' 'unsafe-inline'`.
- `web/next.config.ts:8-12`: `buildGlobalSecurityHeaders(isDev)` se aplica a
  `/(.*)` como cabecera estática.

`'unsafe-inline'` en `script-src` anula la protección principal de la CSP
frente a XSS: cualquier script inline inyectado se ejecuta. Una cabecera
estática no puede llevar un nonce distinto por request.

## Objetivo

1. Eliminar `'unsafe-inline'` de `script-src` en producción.
2. Generar un nonce criptográfico por request y aplicarlo a los scripts de
   Next.js y a cualquier script inline propio.
3. Mantener `'unsafe-eval'` solo en desarrollo.
4. No romper Vercel Analytics, Speed Insights, Trust Pages, ni el flujo de
   auth/dashboard.

## Decisión tomada D1 — páginas estáticas / ISR vs nonce: Opción A

Next.js inyecta el nonce en los scripts de bootstrap durante el render. Una
página prerenderizada (SSG/ISR) tiene HTML generado en build y servido desde
caché: el middleware corre por request, pero no re-renderiza ese HTML. Si se
implementa la política estricta tal cual:

- las páginas estáticas tendrán scripts sin nonce → se bloquean y la página
  muere;
- o, peor, Next reutilizaría un nonce de build → nonce compartido entre
  requests, lo que anula la impredecibilidad por request exigida en los
  criterios de aceptación.

Rutas probablemente afectadas en este proyecto: `/`, `/login`, `/legal/*` y
cualquier página que no lea `headers()`/`cookies()` ni sea `dynamic`. Las
dinámicas (`/dashboard/*`, `/demo`, `/p/[token]`, `/api/*`) no tienen este
problema.

Opciones:

| Opción | Efecto | Costo |
|---|---|---|
| A. Leer `x-nonce` en el root layout | Fuerza render dinámico en todas las páginas que usan el layout; nonce real por request en todo el sitio | Pierde ISR/caché de Vercel en páginas marketing |
| B. Política por clase de ruta | Dinámicas con nonce estricto; estáticas con report-only o hashes de build | Dos políticas que mantener; complejidad media |
| C. `force-dynamic` solo en rutas críticas | Equilibrio caché/seguridad | Hashes de scripts de Next por build = frágil |

**Decisión del propietario: Opción A.** El root layout leerá `x-nonce` y forzará
render dinámico en todas las páginas que lo usen, de modo que el nonce real por
request se aplique a todo el sitio. Consecuencias asumidas:

- Se pierde ISR/caché de Vercel en páginas marketing (`/`, `/login`, `/legal/*`).
- No hay nonce reutilizado entre requests ni páginas estáticas sin nonce.
- `web/app/layout.tsx` debe leer `headers().get('x-nonce')` (en Next 15,
  `headers()` es async) y pasarlo a los componentes que lo necesiten; no basta
  con "solo si Analytics lo necesita".
- `export const dynamic = 'force-dynamic'` (o equivalente) en el root layout
  documenta la decisión y evita prerender silencioso.

D1 queda resuelta y desbloquea P1.

## Diseño propuesto

### 1. Generar el nonce en middleware

`web/middleware.ts` es el único punto que ve todas las requests antes del
render. Hoy su `matcher` solo cubre `/dashboard/:path*`; para CSP hay que
ampliarlo a las páginas (excluyendo assets estáticos de Next):

```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

El middleware debe:

1. Generar 16 bytes aleatorios con Web Crypto:
   `crypto.getRandomValues(new Uint8Array(16))` y codificarlos en base64.
2. Construir la CSP con `buildContentSecurityPolicy(nonce, isDev)`.
3. Propagar el nonce al render:
   - `requestHeaders.set('x-nonce', nonce)`
   - `requestHeaders.set('Content-Security-Policy', csp)`
   - `NextResponse.next({ request: { headers: requestHeaders } })`
4. Copiar la CSP a **todas** las respuestas, incluidas redirecciones:
   `response.headers.set('Content-Security-Policy', csp)`.
5. Conservar la lógica actual de auth: solo `/dashboard/*` exige sesión; el
   resto de rutas sigue público. La generación de CSP no debe introducir
   redirecciones nuevas.

Next.js lee el nonce de la cabecera `Content-Security-Policy` de la request y
lo añade a sus scripts de bootstrap. No se debe pasar el nonce por query string
ni por cookie.

### 2. Mover la CSP fuera de `next.config.ts`

Una cabecera estática y una dinámica con el mismo nombre pueden duplicarse o
pisarse. El plan es:

- Quitar `Content-Security-Policy` de `buildGlobalSecurityHeaders()` en
  `web/lib/security/headers.ts`.
- Dejar el resto de cabeceras (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS) en `next.config.ts`.
- Añadir una función pura `buildContentSecurityPolicy(nonce: string, isDev:
  boolean)` que devuelva la política completa. La CSP deja de depender solo de
  `isDev`; el nonce es obligatorio.
- Mantener `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `object-src 'none'` y `upgrade-insecure-requests` en producción.

### 3. Política objetivo

Fase 1 (scripts, la que resuelve V3):

```text
default-src 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic' [ 'unsafe-eval' en dev ];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://*.vercel-insights.com https://va.vercel-scripts.com
  [ ws: http://localhost:* http://127.0.0.1:* en dev ];
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests [solo prod]
```

`style-src 'unsafe-inline'` se mantiene temporalmente porque React/Next pueden
emitir atributos `style` inline. La fase 2 (opcional) evalúa nonce/hashes para
estilos y `style-src-attr`. No bloquear la entrega de V3 por estilos.

`'strict-dynamic'` permite que un script con nonce cargue los chunks de
Next.js. Si la verificación muestra que algún script legítimo no lo soporta,
se puede retirar y mantener `'self'` + nonce; no se debe volver a
`'unsafe-inline'`.

### 4. Scripts inline propios

No hay `<script>` inline ni `dangerouslySetInnerHTML` en `web/app` ni
`web/components` (verificado con búsqueda). Si se añade uno en el futuro, debe
usar el nonce de `headers().get('x-nonce')` o un componente `next/script`.
Nunca hardcodear el nonce.

### 5. Vercel Analytics y Speed Insights (G2)

`web/app/layout.tsx` monta `<Analytics />` de `@vercel/analytics/next`. Antes
de aplicar la política en producción hay que verificar si también monta
`@vercel/speed-insights`; ese paquete sirve su script desde
`https://va.vercel-scripts.com`, por lo que:

- si está montado, `script-src` debe autorizarlo o su bootstrap inline debe
  recibir el nonce para que `'strict-dynamic'` propague la confianza;
- si no está montado, no añadirlo a la política.

Acción P0: verificar qué paquetes de Vercel están montados y ajustar
`script-src` en consecuencia. No inventar excepciones.

### 6. Matcher y `/api/*` (G4)

El matcher ampliado se mantiene, pero el middleware solo emite CSP en
respuestas HTML (comprobando `content-type` al copiar la cabecera) o excluye
`/api/` del nonce. CSP no aplica a respuestas JSON, y generar nonce en cada
request de `/api/ingest` (tráfico de agentes cada 30 s por device) solo añade
ruido y riesgo de latencia. La autenticación y el rate limit de `/api/ingest`
no se tocan.

### 7. No loguear el nonce (G5)

`x-nonce` viaja como request header. Hay que asegurar que ni el logger de
middleware ni Vercel Analytics lo capturen como propiedad. Un nonce logueado
es un nonce filtrado.

## Enmienda de fases — Report-Only obligatorio (G3)

Report-Only no es una alternativa final: es una fase obligatoria. Orden
actualizado:

| Fase | Contenido | Gate |
|---|---|---|
| P0 | Auditoría de rutas (estática vs dinámica) + verificación de paquetes Vercel montados + decisión D1 documentada en el plan | Sin código |
| P1 | `buildContentSecurityPolicy(nonce, isDev)` + middleware (nonce, matcher, CSP en request/response, auth intacta) + tests | `pnpm typecheck`, tests verdes |
| P2 | Deploy **Report-Only** en preview con `/api/csp-report` que registre violaciones + cabecera `Reporting-Endpoints` | 24–48 h sin violaciones de scripts propios |
| P3 | Corrección de violaciones reales (hash/nonce/excepción documentada por paquete) | Reporte limpio |
| P4 | Enforcement en preview + verificación manual completa del plan | Checklist completo |
| P5 | Producción + monitoreo de reportes 48 h | Criterios de aceptación del plan |

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `web/middleware.ts` | Nonce por request, CSP en request/response, matcher ampliado, auth de dashboard intacta, CSP solo en HTML |
| `web/lib/security/headers.ts` | `buildContentSecurityPolicy(nonce, isDev)`; quitar CSP de `buildGlobalSecurityHeaders` |
| `web/next.config.ts` | Dejar de emitir CSP estática; conservar el resto de cabeceras |
| `web/app/layout.tsx` | Leer `x-nonce` (Opción A, decidida): forzar render dinámico y propagar el nonce; ajuste de Analytics/Speed Insights |
| `web/app/api/csp-report/route.ts` | Nuevo endpoint para el colector de Report-Only (solo logging, sin datos de usuario) |
| `web/lib/security/__tests__/*` | Actualizar/crear tests de la política y del nonce |

## Verificación

1. `cd web && pnpm typecheck`.
2. Tests de cabeceras: la CSP de producción contiene `'nonce-` y no contiene
   `script-src 'self' 'unsafe-inline'`; en dev sí puede contener
   `'unsafe-eval'`.
3. `cd web && pnpm build` y arranque local.
4. En el navegador, con DevTools:
   - cada request a una página trae un nonce distinto;
   - no hay errores `Refused to execute inline script` en consola;
   - login, dashboard, demo, Trust Page y analytics cargan;
   - una respuesta 3xx también trae CSP.
5. Repetir en Preview de Vercel antes de producción.

## Tests que faltan en el plan (añadir)

- Unicidad: dos requests consecutivas → nonces distintos (16 bytes → 24 chars
  base64).
- Presencia en HTML: el nonce del header aparece en los `<script>` de
  bootstrap de la respuesta, no solo en la cabecera.
- Rutas estáticas clasificadas: test que documente qué rutas son dinámicas tras
  la decisión D1.
- Redirects y 4xx/5xx: CSP presente en 3xx, 404 y 500.
- Report-only → enforce: snapshot de la política en ambos modos.

## Criterios de aceptación

- Producción sirve `script-src` con nonce y sin `'unsafe-inline'`.
- Cada request tiene un nonce diferente y no reutilizable.
- No hay regresiones en auth, dashboard, demo ni Trust Pages.
- La CSP se aplica también a redirecciones y respuestas de error.
- Queda documentada cualquier excepción (por ejemplo, Analytics) con su hash o
  justificación.
- D1 resuelta y reflejada en el código antes de P1.
