import { describe, expect, it } from 'vitest';
import { VEHICLE_BY_ID } from '../data/salvadorStations';
import { computeTopographyEnergy, type ProfilePoint } from './energy';
import { ARRIVAL_RESERVE_PCT, chooseRoute, type RouteCandidate } from './routeChoice';

const dolphin = VEHICLE_BY_ID['byd-dolphin-mini'];
const ex30 = VEHICLE_BY_ID['volvo-ex30'];

/** Straight profile from `startM` to `endM` over `km`, with a bump of `climbM` in the middle. */
function profile(km: number, startM: number, endM: number, climbM = 0): ProfilePoint[] {
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    return { distanceKm: km * t, elevationM: startM + (endM - startM) * t + climbM * Math.sin(Math.PI * t) };
  });
}

const candidate = (vehicle = dolphin, km: number, min: number, climbM: number): RouteCandidate => ({
  distanceKm: km,
  durationMin: min,
  energy: computeTopographyEnergy(vehicle, profile(km, 5, 65, climbM)),
});

describe('route choice by relief, battery and vehicle', () => {
  it('keeps the fastest route when it is also the cheapest', () => {
    const d = chooseRoute([candidate(dolphin, 5, 10, 0), candidate(dolphin, 6, 12, 80)], dolphin, 60);
    expect(d.index).toBe(0);
    expect(d.reason).toMatch(/mais rápida também/);
  });

  it('trades a few minutes for less energy when the fast route climbs a hill', () => {
    const d = chooseRoute([candidate(dolphin, 5, 10, 120), candidate(dolphin, 5.2, 11.5, 0)], dolphin, 60);
    expect(d.index).toBe(1);
    expect(d.reason).toMatch(/Economiza/);
  });

  it('does not accept a much slower route when the battery is comfortable', () => {
    // 40% slower: outside the 20% budget, so the fast hilly route wins at 60% battery…
    const options = [candidate(dolphin, 5, 10, 120), candidate(dolphin, 5.2, 14, 0)];
    expect(chooseRoute(options, dolphin, 60).index).toBe(0);
    // …but with low battery the planner accepts it to save energy.
    const low = chooseRoute(options, dolphin, 20);
    expect(low.index).toBe(1);
    expect(low.reason).toMatch(/bateria baixa/);
  });

  it('only accepts routes that arrive above the reserve', () => {
    const options = [candidate(dolphin, 30, 30, 0), candidate(dolphin, 18, 45, 0)];
    const d = chooseRoute(options, dolphin, 14);
    expect(d.evaluations[0].arrivalPct).toBeLessThan(ARRIVAL_RESERVE_PCT);
    expect(d.index).toBe(1);
    expect(d.reachable).toBe(true);
  });

  it('flags when no route is reachable', () => {
    const d = chooseRoute([candidate(dolphin, 40, 40, 0)], dolphin, 6);
    expect(d.reachable).toBe(false);
    expect(d.reason).toMatch(/Nenhuma rota chega/);
  });

  it('depends on the vehicle model: heavier car pays more for the same climb', () => {
    const light = computeTopographyEnergy(dolphin, profile(5, 5, 65, 0));
    const heavy = computeTopographyEnergy(ex30, profile(5, 5, 65, 0));
    expect(heavy.climbKwh).toBeGreaterThan(light.climbKwh);
    const down = profile(5, 65, 5, 0);
    expect(computeTopographyEnergy(ex30, down).regenKwh).toBeGreaterThan(computeTopographyEnergy(dolphin, down).regenKwh);
  });
});
