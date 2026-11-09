# Show de drones del login (panel de marca)

**Ubicación:** `/login`, columna izquierda (solo `lg` y superiores).
**Archivos:** `web/components/marketing/DroneShow.tsx` (renderer + HUD),
`web/components/marketing/droneFormations.ts` (geometría pura),
`web/app/login/page.tsx` (montaje) y `web/app/globals.css` (rótulo animado).

## Qué es

Un enjambre de drones dibujado en canvas que muta entre seis siluetas ligadas
al producto: escudo, globo de red, candado, radar, malla de nodos y monograma
SC. Los drones vuelan de una formación a la siguiente con arcos, estelas y
destellos de aterrizaje. No usa imágenes ni librerías de animación: toda la
figura se genera por geometría.

## Composición

| Capa | Detalle |
|---|---|
| Fondo (canvas cacheado) | Duotono ambiental (cian abajo-izquierda, violeta arriba-derecha), rejilla de 40 px con cruces cada 120 px, polvo y viñeta de 55 % hacia los bordes. Se reconstruye solo al redimensionar. |
| Estelas | Línea tenue de recorrido + núcleo caliente del último 40 % del tramo, solo con drones en vuelo. |
| Contorno | Filamento violeta que une los tramos de la figura, con pulso de señal cian animado (`lineDashOffset`). Aparece a medida que los drones aterrizan. |
| LEDs | Sprite pre-renderizado en 6 pasos de matiz (cian → violeta), núcleo de 2 px coloreado, parpadeo leve y destello al llegar a destino. |
| Barrido | Anillo de luz que cruza la formación una vez por pausa (2,4 s). |
| HUD | “Flota local · en vivo”, cantidad de drones, rótulo de la formación, índice `NN / 06` y barra de progreso con degradé cian→violeta. |

## Ciclo

Cada formación se mantiene **4 100 ms**, el vuelo dura **2 300 ms** con
**520 ms** de dispersión por dron: **≈ 6,9 s por formación** y **≈ 41,5 s**
por ciclo completo, en orden fijo 01 → 06 y reinicio en el escudo.

| # | Rótulo | Figura | Geometría |
|---|---|---|---|
| 01 | Perímetro protegido | Escudo con check | Contorno Bézier espejado + dos trazos paralelos del check |
| 02 | Cobertura de red | Globo | Círculo + 2 meridianos + 2 paralelos |
| 03 | Nada sale del sitio | Candado | Rectángulo redondeado + arco de la argolla + ojo y vástago |
| 04 | Señal en tiempo real | Radar | 3 anillos + 12 marcas + barrido + 5 ecos |
| 05 | Motor determinista local | Malla de nodos | 11 nodos con anillo + 24 enlaces |
| 06 | Firma SC-Sentinel | Monograma SC | S de seis tramos Bézier + C de arco elíptico, centrado por bounding box |

## Parámetros técnicos

- **Densidad:** `clamp(170, 420, área_px / 1050)`. En 1366×900 son 316 drones;
  en 1920×1080, 420.
- **Dispersión:** jitter determinista de ±0,004 unidades (±0,9 px), flotación
  de ±0,0026 unidades.
- **DPR:** limitado a 2; el canvas se dimensiona por `ResizeObserver`.
- **Tokens:** `sc-surface` (#111827) en la viñeta, `sc-viz-in` (#38bdf8) y
  `sc-viz-out` (#a78bfa) en LEDs, filamento y HUD; tipografía mono del sistema
  de diseño.

## Comportamiento

- **`prefers-reduced-motion`:** dibuja una única formación estática y escucha
  cambios en caliente; al desactivarse, reanuda el ciclo.
- **Pestañas ocultas:** el navegador pausa `requestAnimationFrame`. Al volver,
  el componente asienta el enjambre en la formación destino, reinicia el
  cronómetro y reencola un frame nuevo, sin saltos visibles.
- **Resize:** si cambia la densidad se reconstruyen las formaciones y los
  drones; si no, solo cambia la escala y se repinta.

## Accesibilidad

El canvas es decorativo (`aria-hidden`). Los rótulos del HUD son texto real,
pero no viven en una región `aria-live`, para no anunciar cada cambio de
formación a lectores de pantalla.

## Rendimiento

Medido en desarrollo a 1920×1080 con 420 drones: **61 fps** sostenidos. El
fondo se dibuja una vez por resize, los sprites de LED se pre-renderizan y todo
el show usa un único canvas en pantalla.

## Cómo agregar una formación

`Formation.build(count)` debe devolver exactamente `count` puntos y los tramos
que los unen:

```ts
{ points: Pt[]; parts: Array<{ start: number; end: number; closed: boolean }> }
```

Usar `allocate` para repartir drones por peso y `samplePath` para muestrear
caminos por longitud de arco; cerrar los tramos cerrados con `closed: true`.
El renderer aplica jitter sobre `points` sin tocar los índices, así que los
`parts` siguen siendo válidos.

## Baches resueltos en esta entrega

- El HTML servido mostraba **“0 drones”** antes de hidratar: ahora usa **“—”**
  hasta que el canvas mide.
- En **1024×600** el panel crecía y la página hacía scroll: la altura mínima
  del visor bajó a **240 px**.
- **`prefers-reduced-motion`** se leía solo al montar: ahora reacciona al
  cambio mediante `matchMedia`.
- Al volver de una **pestaña oculta** el enjambre saltaba de formación: se
  asienta, se reinicia el ciclo y se reencola el frame.

## Limitaciones conocidas

- El panel de marca está oculto por debajo de `lg` (1024 px), así que el show
  no se muestra en móvil.
- El show no reacciona al formulario de acceso (modo, foco, errores).
- Cada ciclo tarda ≈ 41,5 s; el monograma aparece una vez por ciclo.
