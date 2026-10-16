import * as turf from '@turf/turf';
import { describe, expect, it } from 'vitest';
import { buildInstruction, computeProgress, OFF_ROUTE_M, pointAlong, spokenDistance, toRouteSteps, type OsrmStep } from './navigation';
import { offsetCoords } from './geo';

// An L-shaped 2 km route: 1 km north, then 1 km east (a right turn at the corner).
const start: [number, number] = [-38.5, -12.98];
const corner = turf.destination(start, 1, 0, { units: 'kilometers' }).geometry.coordinates as [number, number];
const end = turf.destination(corner, 1, 90, { units: 'kilometers' }).geometry.coordinates as [number, number];
const line = turf.lineString([start, corner, end]);

const raw: OsrmStep[] = [
  { name: 'Rua A', distance: 1000, duration: 120, maneuver: { type: 'depart', location: start } },
  { name: 'Avenida B', distance: 1000, duration: 120, maneuver: { type: 'turn', modifier: 'right', location: corner } },
  { name: 'Avenida B', distance: 0, duration: 0, maneuver: { type: 'arrive', location: end } },
];
const steps = toRouteSteps(raw, turf.length(line, { units: 'kilometers' }), 'Posto Teste');

describe('instructions in Portuguese', () => {
  it('describes common maneuvers', () => {
    expect(buildInstruction({ type: 'turn', modifier: 'right', exit: null, name: 'Av. Tancredo Neves' })).toBe('Vire à direita na Av. Tancredo Neves');
    expect(buildInstruction({ type: 'turn', modifier: 'slight left', exit: null, name: '' })).toBe('Mantenha-se à esquerda');
    expect(buildInstruction({ type: 'roundabout', modifier: 'right', exit: 2, name: 'Av. Paralela' })).toBe(
      'Na rotatória, pegue a 2ª saída para Av. Paralela',
    );
    expect(buildInstruction({ type: 'arrive', modifier: null, exit: null, name: '' }, 'Posto Dulce')).toBe('Você chegou a Posto Dulce');
    expect(buildInstruction({ type: 'depart', modifier: 'right', exit: null, name: 'Rua Miguel Calmon' })).toBe('Siga pela Rua Miguel Calmon');
  });

  it('rounds distances like a driver hears them', () => {
    expect(spokenDistance(1240)).toBe('1,2 km');
    expect(spokenDistance(276)).toBe('300 m');
    expect(spokenDistance(43)).toBe('40 m');
  });
});

describe('step alignment', () => {
  it('places each maneuver along the geometry', () => {
    expect(steps.map((s) => s.startKm)).toEqual([0, expect.closeTo(1, 2), expect.closeTo(2, 2)]);
    expect(steps[1].instruction).toBe('Vire à direita na Avenida B');
  });
});

describe('live progress', () => {
  it('announces the right turn while driving the first leg', () => {
    const p = computeProgress(line, steps, 4, pointAlong(line, 0.7).coords);
    expect(p.stepIndex).toBe(0);
    expect(p.next?.type).toBe('turn');
    expect(p.distanceToNextM).toBeCloseTo(300, -1);
    expect(p.remainingKm).toBeCloseTo(1.3, 1);
    expect(p.remainingMin).toBeCloseTo(4 * (1.3 / 2), 1);
    expect(p.arrived).toBe(false);
  });

  it('moves to the next step after the corner and detects arrival', () => {
    const after = computeProgress(line, steps, 4, pointAlong(line, 1.4).coords);
    expect(after.stepIndex).toBe(1);
    expect(after.next?.type).toBe('arrive');
    expect(computeProgress(line, steps, 4, { lng: end[0], lat: end[1] }).arrived).toBe(true);
  });

  it('flags the car as off-route beyond the threshold', () => {
    const onRoute = pointAlong(line, 0.5).coords;
    const off = offsetCoords(onRoute, 120, 90 + 180);
    expect(computeProgress(line, steps, 4, onRoute).offRouteM).toBeLessThan(1);
    expect(computeProgress(line, steps, 4, off).offRouteM).toBeGreaterThan(OFF_ROUTE_M);
  });

  it('computes the heading of the simulated car', () => {
    expect(pointAlong(line, 0.5).heading).toBeCloseTo(0, 0);
    expect(Math.abs(pointAlong(line, 1.5).heading - 90)).toBeLessThan(1);
  });
});
