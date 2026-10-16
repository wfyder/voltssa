import { describe, expect, it } from 'vitest';
import { distanceMeters } from './geo';
import type { OsrmStep } from './navigation';
import { dedupeRoutes, MAX_DETOUR_RATIO, stripViaSteps, viaPoints } from './routing';

const step = (type: string): OsrmStep => ({ name: '', distance: 1, duration: 1, maneuver: { type, location: [0, 0] } });

describe('route alternatives', () => {
  it('places one detour point on each side of the trip', () => {
    const from = { lat: -12.9718, lng: -38.5128 };
    const to = { lat: -12.9125, lng: -38.3482 };
    const [left, right] = viaPoints(from, to);
    const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
    // ~2.5 km away from the midpoint (capped), on opposite sides.
    expect(distanceMeters(left, mid)).toBeCloseTo(2500, -2);
    expect(distanceMeters(right, mid)).toBeCloseTo(2500, -2);
    expect(distanceMeters(left, right)).toBeGreaterThan(4500);
  });

  it('removes the arrive/depart pair added by a via point', () => {
    const steps = [step('depart'), step('turn'), step('arrive'), step('depart'), step('turn'), step('arrive')];
    expect(stripViaSteps(steps).map((s) => s.maneuver.type)).toEqual(['depart', 'turn', 'turn', 'arrive']);
  });

  it('drops duplicates and long detours, keeping the main route first', () => {
    const main = { distanceKm: 10, durationMin: 20 };
    const kept = dedupeRoutes([
      main,
      { distanceKm: 10.1, durationMin: 20.2 }, // twin
      { distanceKm: 11, durationMin: 22 }, // real alternative
      { distanceKm: 10 * MAX_DETOUR_RATIO + 1, durationMin: 30 }, // absurd detour
    ]);
    expect(kept).toEqual([main, { distanceKm: 11, durationMin: 22 }]);
  });
});
