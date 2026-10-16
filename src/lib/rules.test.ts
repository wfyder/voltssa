import { describe, expect, it } from 'vitest';
import { SALVADOR_STATIONS, STATION_BY_ID, VEHICLE_BY_ID } from '../data/salvadorStations';
import { bestConnector, isCompatible } from './compatibility';
import { REPORTS_REQUIRED, resolveOfficialStatus, validateReport } from './crowd';
import { computeTopographyEnergy } from './energy';
import { decodeTerrarium } from './elevation';
import { offsetCoords } from './geo';
import { describeHours, isOpenAt } from './hours';
import { estimateCharge, parkingCost, tariffPriceAt } from './pricing';
import { runSelfTests } from './qaSelfTest';
import { simulateLastSlotRace } from './reservationEngine';

const turbo = STATION_BY_ID['turbo-recarga-posto-aeroporto'];
const dolphin = VEHICLE_BY_ID['byd-dolphin-mini'];

describe('station database', () => {
  it('has 43 stations with unique ids', () => {
    expect(SALVADOR_STATIONS).toHaveLength(43);
    expect(new Set(SALVADOR_STATIONS.map((s) => s.id)).size).toBe(43);
  });

  it('flags the known maintenance cases', () => {
    expect(STATION_BY_ID['shopping-center-lapa'].initialStatus).toBe('maintenance');
    expect(STATION_BY_ID['leroy-merlin'].initialStatus).toBe('maintenance');
  });
});

describe('time-of-use tariff (Turbo Recarga)', () => {
  const tariff = turbo.connectors[0].tariff;

  it('charges R$1,99 off-peak and R$2,99 between 16h and 21h', () => {
    expect(tariffPriceAt(tariff, 15)).toBe(1.99);
    expect(tariffPriceAt(tariff, 16)).toBe(2.99);
    expect(tariffPriceAt(tariff, 20)).toBe(2.99);
    expect(tariffPriceAt(tariff, 21)).toBe(1.99);
  });

  it('splits the energy proportionally when the session crosses 16:00', () => {
    // 40 kW (vehicle limit) for 30 min → 20 kWh to the battery, half before / half after 16h.
    const est = estimateCharge({
      station: turbo,
      vehicle: dolphin,
      connector: bestConnector(turbo, dolphin),
      currentPct: 10,
      targetPct: 10 + (20 / 38) * 100,
      startHour: 15,
      startMinute: 45,
    });
    expect(est.crossesPeak).toBe(true);
    const offPeak = est.buckets.find((b) => !b.peak)!;
    const peak = est.buckets.find((b) => b.peak)!;
    expect(offPeak.kwh).toBeCloseTo(10 / 0.9, 1);
    expect(peak.kwh).toBeCloseTo(10 / 0.9, 1);
    expect(est.energyCost).toBeCloseTo((10 / 0.9) * 1.99 + (10 / 0.9) * 2.99, 1);
  });
});

describe('real cost formula', () => {
  it('adds parking proportional to the charging time (free energy trap)', () => {
    const ss = STATION_BY_ID['salvador-shopping'];
    // 7.4 kW station, Dolphin Mini limited to 6.6 kW: 0→100% = 38 kWh ≈ 5h45.
    const est = estimateCharge({ station: ss, vehicle: dolphin, connector: ss.connectors[0], currentPct: 0, targetPct: 100, startHour: 10 });
    expect(est.energyCost).toBe(0);
    expect(est.durationMin).toBeCloseTo((38 / 6.6) * 60, 0);
    expect(est.parkingCost).toBe(15 + 2); // 4h block + 2 extra started hours
    expect(est.total).toBe(est.parkingCost);
  });

  it('bills parking by started hour', () => {
    const rule = STATION_BY_ID['ceo-salvador-shopping'].parking;
    expect(parkingCost(rule, 60)).toBe(11);
    expect(parkingCost(rule, 61)).toBe(16.5);
    expect(parkingCost({ kind: 'block', blockHours: 4, price: 16, extraPerHour: null }, 300)).toBe(32);
  });

  it('includes the Shell activation fee', () => {
    const shell = STATION_BY_ID['posto-shell-aguas-claras'];
    const est = estimateCharge({ station: shell, vehicle: dolphin, connector: shell.connectors[0], currentPct: 50, targetPct: 60, startHour: 12 });
    expect(est.unlockFee).toBe(1.71);
    expect(est.total).toBeCloseTo(est.energyCost + 1.71, 6);
  });
});

describe('business hours', () => {
  it('blocks Hiperideal at 21h and dealerships at 18h', () => {
    expect(isOpenAt(STATION_BY_ID['hiperideal-caminho-das-arvores'].hours, 21)).toBe(false);
    expect(isOpenAt(STATION_BY_ID['porsche-center-salvador'].hours, 18)).toBe(false);
    expect(isOpenAt(STATION_BY_ID['posto-dulce'].hours, 2)).toBe(true);
    expect(describeHours(STATION_BY_ID['hiperideal-vitoria'].hours, 6)).toContain('abre às 07:00');
  });
});

describe('plug compatibility', () => {
  it('blocks CHAdeMO and AC-only vehicles at CCS2-only stations', () => {
    const dc = STATION_BY_ID['eletroposto-av-tancredo-neves'];
    expect(isCompatible(dc, VEHICLE_BY_ID['nissan-leaf'])).toBe(false);
    expect(isCompatible(dc, VEHICLE_BY_ID['phev'])).toBe(false);
    expect(isCompatible(dc, VEHICLE_BY_ID['volvo-ex30'])).toBe(true);
  });
});

describe('crowdsourcing anti-fraud', () => {
  const station = STATION_BY_ID['posto-dulce'];
  const base = { status: 'maintenance' as const, method: 'report' as const, reporterId: 'qa', stationCoords: station.coords, existingReports: [] };

  it('rejects broken-charger reports from more than 100 m away', () => {
    const verdict = validateReport({ ...base, userLocation: offsetCoords(station.coords, 101, 0) });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('GEO_FRAUD');
  });

  it('accepts reports from within 100 m', () => {
    expect(validateReport({ ...base, userLocation: offsetCoords(station.coords, 99, 0) }).ok).toBe(true);
  });

  it(`needs ${REPORTS_REQUIRED} distinct reporters to change the official status`, () => {
    const r = (id: string) => ({ id, reporterId: id, status: 'maintenance' as const, createdAt: 0, distanceM: 5, method: 'report' as const });
    expect(resolveOfficialStatus('available', [r('a'), r('b')]).changed).toBe(false);
    expect(resolveOfficialStatus('available', [r('a'), r('b'), r('c')])).toMatchObject({ changed: true, status: 'maintenance' });
  });
});

describe('reservation lock', () => {
  it('reproduces overbooking without a lock and prevents it with the mutex', async () => {
    const unsafe = await simulateLastSlotRace(false, 5);
    const safe = await simulateLastSlotRace(true, 5);
    expect(unsafe.finalTaken).toBe(2);
    expect(safe.finalTaken).toBe(1);
    expect(safe.outcomes.map((o) => o.status).sort()).toEqual(['confirmed', 'rejected']);
  });
});

describe('topography energy', () => {
  it('climbing costs more than flat, descending regenerates', () => {
    const up = computeTopographyEnergy(dolphin, [
      { distanceKm: 0, elevationM: 5 },
      { distanceKm: 1, elevationM: 65 },
    ]);
    const down = computeTopographyEnergy(dolphin, [
      { distanceKm: 0, elevationM: 65 },
      { distanceKm: 1, elevationM: 5 },
    ]);
    expect(up.realKwh).toBeGreaterThan(up.flatKwh);
    expect(down.realKwh).toBeLessThan(down.flatKwh);
    // 1239 kg × 9.81 × 60 m / 3.6e6 / 0.88 ≈ 0.23 kWh
    expect(up.climbKwh).toBeCloseTo(0.23, 2);
  });

  it('decodes Terrarium pixels', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(128, 65, 0)).toBe(65);
  });
});

describe('in-app self-test suite', () => {
  it('passes every check', async () => {
    const results = await runSelfTests();
    expect(results.filter((r) => !r.passed)).toEqual([]);
  });
});
