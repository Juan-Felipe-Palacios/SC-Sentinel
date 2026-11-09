// SC-Sentinel — show de drones del panel de marca del login.
// Enjambre en canvas que muta entre formaciones ligadas al producto:
// escudo, globo de red, candado local, radar, malla de nodos y monograma.
// Siluetas nítidas: LEDs con núcleo duro, filamento de contorno y pulsos
// de señal recorriéndolo. Fondo técnico con la rejilla de marca.
// Sin assets: todo se genera por geometría y CSS.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { useEffect, useRef, useState } from 'react';
import { FORMATIONS, type FormationShape, type Pt } from './droneFormations';

/* ------------------------------------------------------------------ */
/* Enjambre                                                            */
/* ------------------------------------------------------------------ */

type Drone = {
  from: Pt;
  to: Pt;
  x: number;
  y: number;
  px: number;
  py: number;
  delay: number;
  arc: number;
  phase: number;
  speed: number;
  brightness: number;
  hue: number;
  hueTarget: number;
};

const TAU = Math.PI * 2;
const HOLD_MS = 4100;
const TRAVEL_MS = 2300;
const STAGGER_MS = 520;
const FLARE_MS = 340;
const SPRITE_STEPS = 6;
const CYAN: [number, number, number] = [56, 189, 248];
const VIOLET: [number, number, number] = [167, 139, 250];

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Ruido determinista por índice: apenas despega la silueta. */
function jitter(points: Pt[], amount: number, seed: number): Pt[] {
  return points.map((p, i) => {
    const a = Math.sin((i + seed) * 12.9898) * 43758.5453;
    const b = Math.sin((i + seed) * 78.233) * 12543.123;
    return {
      x: p.x + (a - Math.floor(a) - 0.5) * amount,
      y: p.y + (b - Math.floor(b) - 0.5) * amount,
    };
  });
}

/** Duotono de marca: cian abajo-izquierda, violeta arriba-derecha. */
function hueFor(point: Pt) {
  const raw = (point.x * 0.5 + point.y * 0.55 + 1.02) / 2.1;
  return clamp01(raw) * 0.92;
}

function mixHue(hue: number): [number, number, number] {
  const t = clamp01(hue);
  return [
    Math.round(CYAN[0] + (VIOLET[0] - CYAN[0]) * t),
    Math.round(CYAN[1] + (VIOLET[1] - CYAN[1]) * t),
    Math.round(CYAN[2] + (VIOLET[2] - CYAN[2]) * t),
  ];
}

/** LED compacto: núcleo duro y halo corto, para que el punto no se deshaga. */
function makeSprite(hue: number): HTMLCanvasElement {
  const size = 48;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const [r, g, b] = mixHue(hue);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  gradient.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, 0.86)`);
  gradient.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, 0.26)`);
  gradient.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, 0.04)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

/** Núcleo del LED: el color de marca aclarado, no blanco puro. */
function coreColor(hue: number): string {
  const [r, g, b] = mixHue(hue);
  const lift = (channel: number) => Math.round(channel + (255 - channel) * 0.24);
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}

/** Fondo estático: duotono ambiental, rejilla técnica, polvo y viñeta. */
function buildBackdrop(width: number, height: number, dpr: number): HTMLCanvasElement {
  const backdrop = document.createElement('canvas');
  backdrop.width = Math.max(1, Math.round(width * dpr));
  backdrop.height = Math.max(1, Math.round(height * dpr));
  const ctx = backdrop.getContext('2d');
  if (!ctx) return backdrop;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const maxRadius = Math.max(width, height);

  const cool = ctx.createRadialGradient(
    width * 0.28, height * 0.82, 0,
    width * 0.28, height * 0.82, maxRadius * 0.62
  );
  cool.addColorStop(0, 'rgba(56, 189, 248, 0.13)');
  cool.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, width, height);

  const warm = ctx.createRadialGradient(
    width * 0.8, height * 0.16, 0,
    width * 0.8, height * 0.16, maxRadius * 0.58
  );
  warm.addColorStop(0, 'rgba(167, 139, 250, 0.12)');
  warm.addColorStop(1, 'rgba(167, 139, 250, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, width, height);

  // Rejilla técnica (misma firma visual que marketing).
  const step = 40;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)';
  ctx.beginPath();
  for (let x = (width % step) / 2; x <= width; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = (height % step) / 2; y <= height; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  // Cruces de referencia, cada 120 px.
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
  ctx.beginPath();
  for (let x = (width % 120) / 2; x <= width; x += 120) {
    for (let y = (height % 120) / 2; y <= height; y += 120) {
      ctx.moveTo(x - 3, y + 0.5);
      ctx.lineTo(x + 3, y + 0.5);
      ctx.moveTo(x + 0.5, y - 3);
      ctx.lineTo(x + 0.5, y + 3);
    }
  }
  ctx.stroke();

  // Polvo: da profundidad sin competir con la silueta.
  let seed = 9271;
  const dust = Math.round((width * height) / 4200);
  ctx.fillStyle = '#cbd5e1';
  for (let i = 0; i < dust; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const x = (seed / 233280) * width;
    seed = (seed * 9301 + 49297) % 233280;
    const y = (seed / 233280) * height;
    seed = (seed * 9301 + 49297) % 233280;
    const r = seed / 233280;
    ctx.globalAlpha = 0.05 + r * 0.2;
    ctx.fillRect(x, y, 0.5 + r * 1.1, 0.5 + r * 1.1);
  }
  ctx.globalAlpha = 1;

  // Viñeta: enfoca el centro.
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, maxRadius * 0.78
  );
  vignette.addColorStop(0, 'rgba(17, 24, 39, 0)');
  vignette.addColorStop(1, 'rgba(17, 24, 39, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  return backdrop;
}

export function DroneShow() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(0);
  const [droneCount, setDroneCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionQuery.matches;
    let running = false;
    const sprites = Array.from({ length: SPRITE_STEPS }, (_, i) => makeSprite(i / (SPRITE_STEPS - 1)));
    const cores = Array.from({ length: SPRITE_STEPS }, (_, i) => coreColor(i / (SPRITE_STEPS - 1)));

    let width = 0;
    let height = 0;
    let radius = 120;
    let backdrop: HTMLCanvasElement | null = null;
    let drones: Drone[] = [];
    let targets: FormationShape[] = [];
    let formation = 0;
    let stage: 'hold' | 'travel' = 'hold';
    let stageStart = performance.now();
    let frame = 0;

    function spawnDrones(count: number) {
      const points = targets[formation]?.points ?? [];
      drones = Array.from({ length: count }, (_, i) => {
        const target = points[i] ?? { x: 0, y: 0 };
        const hue = hueFor(target);
        return {
          from: { ...target },
          to: { ...target },
          x: target.x,
          y: target.y,
          px: target.x,
          py: target.y,
          delay: (i % 14) * 34,
          arc: 0,
          phase: (i * 1.7) % TAU,
          speed: 0.7 + ((i * 37) % 100) / 100,
          brightness: 0.85 + ((i * 17) % 100) / 800,
          hue,
          hueTarget: hue,
        };
      });
    }

    function assignTargets() {
      const points = targets[formation]?.points;
      if (!points) return;
      drones.forEach((drone, i) => {
        const target = points[i] ?? points[points.length - 1];
        drone.from = { x: drone.x, y: drone.y };
        drone.to = { ...target };
        drone.hueTarget = hueFor(target);
        drone.delay = (((i * 53) % 100) / 100) * STAGGER_MS;
        const dx = target.x - drone.x;
        const dy = target.y - drone.y;
        const distance = Math.hypot(dx, dy);
        drone.arc =
          (i % 2 === 0 ? -1 : 1) *
          (0.035 + (((i * 29) % 100) / 100) * 0.11) *
          Math.min(1, distance * 1.3);
      });
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) return;
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      radius = Math.min(width, height) * 0.4;

      // Más drones y más apretados: el contorno se lee como una línea.
      const count = Math.max(170, Math.min(420, Math.round((width * height) / 1050)));
      if (count !== drones.length || targets.length === 0) {
        targets = FORMATIONS.map((item) => {
          const shape = item.build(count);
          return { points: jitter(shape.points, 0.004, 11), parts: shape.parts };
        });
        spawnDrones(count);
        setDroneCount(count);
        stage = 'hold';
        stageStart = performance.now();
      }
      backdrop = buildBackdrop(width, height, dpr);
      draw(performance.now());
      start();
    }

    /** Congela el enjambre donde debe estar: sin saltos al pausar o cambiar de pestaña. */
    function settle() {
      for (const drone of drones) {
        drone.from = { ...drone.to };
        drone.x = drone.to.x;
        drone.y = drone.to.y;
        drone.px = drone.to.x;
        drone.py = drone.to.y;
        drone.hue = drone.hueTarget;
      }
    }

    function start() {
      if (running || reduceMotion || width < 24) return;
      running = true;
      frame = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
    }

    /** Reanuda con un frame nuevo: el navegador puede descartar el pendiente. */
    function restart() {
      running = false;
      cancelAnimationFrame(frame);
      start();
    }

    function step(drone: Drone, now: number) {
      const progress =
        stage === 'travel'
          ? easeInOutCubic(clamp01((now - stageStart - drone.delay) / TRAVEL_MS))
          : 1;
      const dx = drone.to.x - drone.from.x;
      const dy = drone.to.y - drone.from.y;
      const distance = Math.hypot(dx, dy) || 1;
      const bulge = drone.arc * Math.sin(Math.PI * progress);
      const hoverX = Math.sin(now * 0.0011 * drone.speed + drone.phase) * 0.0026;
      const hoverY = Math.cos(now * 0.0009 * drone.speed + drone.phase * 1.6) * 0.0026;

      drone.px = drone.x;
      drone.py = drone.y;
      drone.x = drone.from.x + dx * progress + (-dy / distance) * bulge + hoverX;
      drone.y = drone.from.y + dy * progress + (dx / distance) * bulge + hoverY;
      drone.hue += (drone.hueTarget - drone.hue) * 0.03;
    }

    function drawFilaments(
      shape: FormationShape,
      alpha: number,
      now: number,
      projectX: (x: number) => number,
      projectY: (y: number) => number
    ) {
      const count = drones.length;
      ctx!.beginPath();
      for (const part of shape.parts) {
        const end = Math.min(part.end, count - 1);
        for (let i = part.start; i < end; i++) {
          const a = drones[i];
          const b = drones[i + 1];
          if (!a || !b) continue;
          ctx!.moveTo(projectX(a.x), projectY(a.y));
          ctx!.lineTo(projectX(b.x), projectY(b.y));
        }
        if (part.closed && part.start < count) {
          const a = drones[end];
          const b = drones[part.start];
          if (a && b) {
            ctx!.moveTo(projectX(a.x), projectY(a.y));
            ctx!.lineTo(projectX(b.x), projectY(b.y));
          }
        }
      }

      ctx!.strokeStyle = `rgba(167, 139, 250, ${alpha})`;
      ctx!.lineWidth = 1;
      ctx!.stroke();

      // Pulso de señal recorriendo el contorno.
      if (alpha > 0.07) {
        ctx!.save();
        ctx!.setLineDash([10, 240]);
        ctx!.lineDashOffset = -((now * 0.05) % 250);
        ctx!.strokeStyle = `rgba(186, 230, 253, ${Math.min(0.5, alpha * 2.4)})`;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
        ctx!.restore();
      }
    }

    function draw(now: number) {
      if (width === 0 || height === 0) return;
      const cx = width / 2;
      const cy = height / 2;
      const projectX = (x: number) => cx + x * radius;
      const projectY = (y: number) => cy - y * radius;
      const shape = targets[formation];

      ctx!.globalCompositeOperation = 'source-over';
      ctx!.clearRect(0, 0, width, height);
      if (backdrop) ctx!.drawImage(backdrop, 0, 0, width, height);
      ctx!.globalCompositeOperation = 'lighter';

      // Estelas: una tenue completa y un núcleo caliente cerca del dron.
      ctx!.beginPath();
      const hot = new Path2D();
      let hasTrail = false;
      for (const drone of drones) {
        const ax = projectX(drone.px);
        const ay = projectY(drone.py);
        const bx = projectX(drone.x);
        const by = projectY(drone.y);
        if (Math.hypot(bx - ax, by - ay) < 0.7) continue;
        ctx!.moveTo(ax, ay);
        ctx!.lineTo(bx, by);
        hot.moveTo(ax + (bx - ax) * 0.6, ay + (by - ay) * 0.6);
        hot.lineTo(bx, by);
        hasTrail = true;
      }
      if (hasTrail) {
        ctx!.strokeStyle = 'rgba(56, 189, 248, 0.12)';
        ctx!.lineWidth = 1;
        ctx!.stroke();
        ctx!.strokeStyle = 'rgba(186, 230, 253, 0.3)';
        ctx!.lineWidth = 1.6;
        ctx!.stroke(hot);
      }

      // Filamento que define el contorno: aparece a medida que los drones llegan.
      const settle =
        stage === 'hold'
          ? 1
          : easeInOutCubic(clamp01((now - stageStart - STAGGER_MS) / TRAVEL_MS));
      if (shape) drawFilaments(shape, 0.03 + 0.15 * settle, now, projectX, projectY);

      // LEDs.
      for (const drone of drones) {
        const x = projectX(drone.x);
        const y = projectY(drone.y);
        const twinkle = 0.93 + 0.07 * Math.sin(now * 0.0036 * drone.speed + drone.phase);
        const flying = stage === 'travel' ? 0.4 : 0;

        // Destello al aterrizar en su posición.
        let flare = 0;
        if (stage === 'travel') {
          const since = now - (stageStart + drone.delay + TRAVEL_MS);
          if (since > 0 && since < FLARE_MS) flare = 1 - since / FLARE_MS;
        }

        // Barrido de señal: un anillo de luz cruza la formación en cada pausa.
        let scan =
          stage === 'hold'
            ? Math.exp(
                -Math.pow(Math.hypot(drone.x, drone.y) - (((now - stageStart) % 2400) / 2400) * 1.34, 2) / 0.02
              ) * (1 - ((now - stageStart) % 2400) / 2400)
            : 0;
        if (scan < 0.02) scan = 0;

        const size =
          (9.5 + twinkle * 2.2 + flying * 4 + flare * 7 + scan * 5) * (0.94 + drone.brightness * 0.14);
        const index = Math.round(drone.hue * (SPRITE_STEPS - 1));

        ctx!.globalAlpha = Math.min(1, drone.brightness * twinkle + flying * 0.2 + flare * 0.4 + scan * 0.4);
        ctx!.drawImage(sprites[index], x - size / 2, y - size / 2, size, size);
        ctx!.globalAlpha = Math.min(1, 0.84 + flare * 0.16 + scan * 0.16);
        ctx!.fillStyle = cores[index];
        ctx!.fillRect(x - 1, y - 1, 2, 2);
      }

      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = 'source-over';
    }

    function loop(now: number) {
      if (!running) return;
      const elapsed = now - stageStart;
      if (stage === 'hold') {
        if (elapsed > HOLD_MS) {
          formation = (formation + 1) % FORMATIONS.length;
          assignTargets();
          stage = 'travel';
          stageStart = now;
          setActive(formation);
        }
      } else if (elapsed > TRAVEL_MS + STAGGER_MS) {
        stage = 'hold';
        stageStart = now;
      }

      for (const drone of drones) step(drone, now);
      draw(now);
      frame = requestAnimationFrame(loop);
    }

    function onMotionChange() {
      reduceMotion = motionQuery.matches;
      if (reduceMotion) {
        stop();
        settle();
        stage = 'hold';
        stageStart = performance.now();
        draw(performance.now());
      } else {
        stageStart = performance.now();
        restart();
      }
    }

    function onVisibilityChange() {
      if (document.hidden) return;
      // Al volver, evitar que el enjambre salte de golpe a la formación.
      if (stage === 'travel') {
        settle();
        stage = 'hold';
      }
      stageStart = performance.now();
      // Chromium pausa rAF en pestañas ocultas: al volver, hay que reencolar.
      restart();
    }

    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
    motionQuery.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    resize();

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />

      {/* Línea de barrido del panel. */}
      <span
        aria-hidden="true"
        className="sc-scan-line pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-sc-viz-in/25 to-transparent"
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.26em] text-sc-text-muted/75">
          <span className="flex items-center gap-2">
            <span className="sc-pulse-dot size-1.5 rounded-full bg-sc-viz-in" />
            Flota local · en vivo
          </span>
          <span className="tabular-nums">
            {droneCount > 0 ? `${droneCount} drones` : '—'}
          </span>
        </div>

        <div className="max-w-md">
          <div className="flex items-baseline justify-between gap-4">
            <p
              key={active}
              className="sc-drone-caption font-mono text-[10px] uppercase tracking-[0.28em] text-sc-viz-in"
            >
              {FORMATIONS[active].label}
            </p>
            <span className="font-mono text-[9px] tabular-nums tracking-[0.22em] text-sc-text-muted/70">
              {String(active + 1).padStart(2, '0')} / {String(FORMATIONS.length).padStart(2, '0')}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5" aria-hidden="true">
            {FORMATIONS.map((formation, index) => (
              <span
                key={formation.label}
                className={`h-px flex-1 transition-all duration-700 ${
                  index === active
                    ? 'bg-gradient-to-r from-sc-viz-in to-sc-viz-out opacity-90'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
