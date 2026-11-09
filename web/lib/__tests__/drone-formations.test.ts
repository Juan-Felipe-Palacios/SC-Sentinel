import { describe, expect, it } from 'vitest';
import { FORMATIONS, type FormationShape, type Pt } from '@/components/marketing/droneFormations';

const FORMATION_COUNT = 50; // cantidad fija para todas las formaciones

describe('Drone formations: point and part counts', () => {
  it('each formation returns exactly count points', () => {
    for (const formation of FORMATIONS) {
      const shape = formation.build(FORMATION_COUNT);
      expect(shape.points).toHaveLength(FORMATION_COUNT);
    }
  });

  it('each formation returns parts with valid indices', () => {
    for (const formation of FORMATIONS) {
      const shape = formation.build(FORMATION_COUNT);
      for (const part of shape.parts) {
        // start debe ser menor que end (o closed con start === end - 1)
        expect(part.start).toBeLessThanOrEqual(part.end);
        // ambos índices deben estar dentro del rango de points
        expect(part.start).toBeGreaterThanOrEqual(0);
        expect(part.end).toBeLessThan(shape.points.length);
        // si closed es true, end suele ser el último índice o start - 1
        if (part.closed) {
          // en un cierre válido, end debe ser el último punto o start - 1
          expect(part.end).toBeLessThan(shape.points.length);
        }
      }
    }
  });

  it('each formation has at least one part', () => {
    for (const formation of FORMATIONS) {
      const shape = formation.build(FORMATION_COUNT);
      expect(shape.parts.length).toBeGreaterThan(0);
    }
  });

  it('all points are valid Pt objects with x and y numbers', () => {
    for (const formation of FORMATIONS) {
      const shape = formation.build(FORMATION_COUNT);
      for (const p of shape.points) {
        expect(p).toHaveProperty('x');
        expect(p).toHaveProperty('y');
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
        // coordenadas deben estar en un rango razonable (-1 a 1 aproximadamente)
        expect(p.x).toBeGreaterThanOrEqual(-2);
        expect(p.x).toBeLessThanOrEqual(2);
        expect(p.y).toBeGreaterThanOrEqual(-2);
        expect(p.y).toBeLessThanOrEqual(2);
      }
    }
  });
});