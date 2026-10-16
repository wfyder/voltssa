/**
 * Regression tests for the findings fixed after the 16/10/2026 audit
 * (see docs/auditoria-2026-10-16.md).
 */
import * as turf from '@turf/turf';
import { describe, expect, it } from 'vitest';
import { registerStation, SALVADOR_STATIONS, STATION_BY_ID, VEHICLE_BY_ID } from '../data/salvadorStations';
import { validateReport } from './crowd';
import { computeTopographyEnergy } from './energy';
import { offsetCoords } from './geo';
import { computeProgress, headingBetween, OFF_ROUTE_M, pointAlong, rerouteCooldownMs, safeHeading, toRouteSteps } from './navigation';
import { osrmCoordinate, replanForVehicle, type SmartRoute } from './routing';
import { EMPTY_DRAFT, parseStoredStations, stationFromDraft, type StationDraft } from './stationDraft';

const validDraft: StationDraft = {
  ...EMPTY_DRAFT,
  name: 'Posto Teste Auditoria',
  neighborhood: 'Cajazeiras',
  coords: { lat: -12.905, lng: -38.405 },
  connectors: [{ type: 'CCS2_DC', powerKw: 60, pricePerKwh: 2.5 }],
  slots: 2,
};
const stored = (overrides: Record<string, unknown> = {}) => ({
  ...JSON.parse(JSON.stringify(stationFromDraft(validDraft, 'user-posto-teste-1', 44, 1))),
  ...overrides,
});
const parse = (list: unknown[]) => parseStoredStations(JSON.stringify(list), SALVADOR_STATIONS);

describe('M9 / B-storage: stations loaded from localStorage are fully validated', () => {
  it('keeps a valid saved station', () => {
    const { stations, discarded } = parse([stored()]);
    expect(discarded).toBe(0);
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({ id: 'user-posto-teste-1', source: 'user', name: 'Posto Teste Auditoria' });
  });

  it('drops a station whose connector has no tariff instead of crashing later', () => {
    const broken = stored({ connectors: [{ type: 'TYPE2_AC', powerKw: 7 }] });
    expect(parse([broken])).toEqual({ stations: [], discarded: 1 });
  });

  it('drops wrong types, out-of-range coordinates and stations outside Salvador', () => {
    const result = parse([
      stored({ id: 'user-a', neighborhood: {} }),
      stored({ id: 'user-b', coords: { lat: 95, lng: -38.5 } }),
      stored({ id: 'user-c', coords: { lat: 1e308, lng: -38.5 } }),
      stored({ id: 'user-d', coords: { lat: -23.55, lng: -46.63 } }),
      stored({ id: 'user-e', connectors: [{ type: 'TYPE2_AC', powerKw: 400, tariff: { kind: 'flat', pricePerKwh: 0 } }] }),
    ]);
    expect(result).toEqual({ stations: [], discarded: 5 });
  });

  it('rejects ids that would override curated stations or the object prototype', () => {
    const result = parse([stored({ id: 'posto-dulce' }), stored({ id: '__proto__' }), stored({ id: 'constructor' })]);
    expect(result.stations).toHaveLength(0);
    expect(result.discarded).toBe(3);
  });

  it('rejects names of curated stations and duplicated entries', () => {
    const result = parse([stored({ name: 'Posto Dulce' }), stored(), stored()]);
    expect(result.stations).toHaveLength(1);
    expect(result.discarded).toBe(2);
  });

  it('survives corrupted JSON and strips control characters from text', () => {
    expect(parseStoredStations('{not json', SALVADOR_STATIONS)).toEqual({ stations: [], discarded: 1 });
    const { stations } = parse([stored({ notes: 'ok\u0000\u001b[31m' })]);
    expect(stations[0].notes).toBe('ok[31m');
  });

  it('never lets a user station replace a curated one in the registry', () => {
    const fake = stationFromDraft(validDraft, 'posto-dulce', 99);
    expect(registerStation(fake)).toBe(false);
    expect(STATION_BY_ID['posto-dulce'].source).toBe('survey');
    expect(Object.getPrototypeOf(STATION_BY_ID)).toBeNull();
  });
});

describe('M8: arrival needs the car to be on the route', () => {
  const start: [number, number] = [-38.5, -12.98];
  const end = turf.destination(start, 1, 0, { units: 'kilometers' }).geometry.coordinates as [number, number];
  const line = turf.lineString([start, end]);
  const steps = toRouteSteps(
    [
      { name: 'Rua A', distance: 1000, duration: 120, maneuver: { type: 'depart', location: start } },
      { name: 'Rua A', distance: 0, duration: 0, maneuver: { type: 'arrive', location: end } },
    ],
    1,
    'Posto',
  );

  it('does not arrive when the car is past the end but far from the route', () => {
    const beyond = offsetCoords({ lng: end[0], lat: end[1] }, 150, 90);
    const p = computeProgress(line, steps, 2, beyond);
    expect(p.offRouteM).toBeGreaterThan(OFF_ROUTE_M);
    expect(p.arrived).toBe(false);
  });

  it('still arrives at the destination', () => {
    expect(computeProgress(line, steps, 2, pointAlong(line, 0.99).coords).arrived).toBe(true);
  });
});

describe('M13: GPS heading is always a finite angle', () => {
  it('skips NaN/null and normalises', () => {
    expect(safeHeading(Number.NaN, null, 370)).toBe(10);
    expect(safeHeading(undefined, -90)).toBe(270);
    expect(safeHeading(Number.NaN)).toBe(0);
  });

  it('computes the bearing between two fixes', () => {
    const a = { lat: -12.97, lng: -38.5 };
    expect(headingBetween(a, { lat: -12.96, lng: -38.5 })).toBeCloseTo(0, 5);
    expect(headingBetween(a, { lat: -12.97, lng: -38.49 })).toBeCloseTo(90, 5);
  });
});

describe('M4: reroute backs off after failures', () => {
  it('doubles the wait up to 64 s', () => {
    expect([0, 1, 2, 3, 9].map(rerouteCooldownMs)).toEqual([8000, 16000, 32000, 64000, 64000]);
  });
});

describe('B-privacy: coordinates sent to OSRM are rounded', () => {
  it('rounds the origin to ~11 m and rejects non-finite input', () => {
    expect(osrmCoordinate({ lat: -12.987654321, lng: -38.451234567 }, 4)).toBe('-38.4512,-12.9877');
    expect(() => osrmCoordinate({ lat: Number.NaN, lng: 0 }, 4)).toThrow();
  });
});

describe('M1: changing vehicle or battery re-plans the route locally', () => {
  const profile = (climb: number) =>
    Array.from({ length: 11 }, (_, i) => ({ distanceKm: i * 0.5, elevationM: 5 + climb * Math.sin((Math.PI * i) / 10) }));
  const option = (min: number, climb: number) => {
    const p = profile(climb);
    return {
      geometry: turf.lineString([
        [-38.5, -12.98],
        [-38.49, -12.97],
      ]),
      distanceKm: 5,
      durationMin: min,
      profile: p,
      energy: computeTopographyEnergy(VEHICLE_BY_ID['byd-dolphin-mini'], p),
      steps: [],
    };
  };
  const options = [option(10, 140), option(14, 0)];
  const route: SmartRoute = {
    ...options[0],
    options,
    evaluations: [],
    chosenIndex: 0,
    recommendedIndex: 0,
    choiceReason: '',
    reachable: true,
    routingSource: 'osrm',
    elevationSource: 'terrarium',
  };

  it('recomputes energy for the new vehicle and the choice for the new battery', () => {
    const ex30 = VEHICLE_BY_ID['volvo-ex30'];
    const comfortable = replanForVehicle(route, ex30, 80);
    expect(comfortable.options[0].energy.climbKwh).toBeCloseTo(computeTopographyEnergy(ex30, options[0].profile).climbKwh, 10);
    expect(comfortable.chosenIndex).toBe(0); // 40% slower detour not worth it at 80%
    const low = replanForVehicle(route, ex30, 12);
    expect(low.chosenIndex).toBe(1); // low battery: take the flat route
    expect(low.evaluations[1].arrivalPct).toBeCloseTo(12 - (low.options[1].energy.realKwh / ex30.batteryKwh) * 100, 10);
  });
});

describe('Uncertain #24: taking a station out of maintenance needs presence', () => {
  const station = STATION_BY_ID['posto-dulce'];
  const base = { method: 'report' as const, reporterId: 'qa', stationCoords: station.coords, existingReports: [] };

  it('blocks a remote "available" vote for a station in maintenance', () => {
    const far = validateReport({ ...base, status: 'available', currentStatus: 'maintenance', userLocation: offsetCoords(station.coords, 3000, 0) });
    expect(far.ok).toBe(false);
    const near = validateReport({ ...base, status: 'available', currentStatus: 'maintenance', userLocation: offsetCoords(station.coords, 40, 0) });
    expect(near.ok).toBe(true);
  });

  it('still allows a remote "busy" vote for a working station', () => {
    expect(validateReport({ ...base, status: 'busy', currentStatus: 'available', userLocation: null }).ok).toBe(true);
  });
});
