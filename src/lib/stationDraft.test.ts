import { describe, expect, it } from 'vitest';
import { SALVADOR_STATIONS, STATION_BY_ID, VEHICLE_BY_ID } from '../data/salvadorStations';
import { isCompatible } from './compatibility';
import { offsetCoords } from './geo';
import { estimateCharge } from './pricing';
import { draftFromStation, EMPTY_DRAFT, stationFromDraft, validateDraft, type StationDraft } from './stationDraft';

const valid: StationDraft = {
  ...EMPTY_DRAFT,
  name: 'Eletroposto Teste Cajazeiras',
  neighborhood: 'Cajazeiras',
  address: 'Estrada do Coqueiro Grande, 100',
  coords: { lat: -12.905, lng: -38.405 },
  connectors: [
    { type: 'TYPE2_AC', powerKw: 22, pricePerKwh: 1.5 },
    { type: 'CCS2_DC', powerKw: 60, pricePerKwh: 2.5 },
  ],
  slots: 2,
  is24h: false,
  open: 7,
  close: 22,
  parkingKind: 'hourly',
  parkingPrice: 10,
  parkingExtraPerHour: 4,
};

describe('station draft validation', () => {
  it('accepts a complete draft', () => {
    const v = validateDraft(valid, SALVADOR_STATIONS);
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  it('rejects coordinates outside Salvador', () => {
    const v = validateDraft({ ...valid, coords: { lat: -12.7, lng: -38.3 } }, SALVADOR_STATIONS); // Camaçari
    expect(v.errors.coords).toMatch(/fora de Salvador/);
  });

  it('requires a location and a name', () => {
    const v = validateDraft({ ...valid, coords: null, name: ' a ' }, SALVADOR_STATIONS);
    expect(v.errors.coords).toBeDefined();
    expect(v.errors.name).toBeDefined();
  });

  it('rejects AC power above 22 kW and implausible DC power', () => {
    expect(validateDraft({ ...valid, connectors: [{ type: 'TYPE2_AC', powerKw: 43, pricePerKwh: 0 }] }, []).errors.connectors).toMatch(/22 kW/);
    expect(validateDraft({ ...valid, connectors: [{ type: 'CCS2_DC', powerKw: 5, pricePerKwh: 0 }] }, []).errors.connectors).toMatch(/15/);
    expect(validateDraft({ ...valid, connectors: [] }, []).errors.connectors).toBeDefined();
  });

  it('rejects closing before opening', () => {
    expect(validateDraft({ ...valid, open: 22, close: 8 }, []).errors.hours).toBeDefined();
    expect(validateDraft({ ...valid, open: 22, close: 8, is24h: true }, []).ok).toBe(true);
  });

  it('blocks duplicate names and warns about a station a few metres away', () => {
    const dulce = STATION_BY_ID['posto-dulce'];
    expect(validateDraft({ ...valid, name: 'posto  DULCE' }, SALVADOR_STATIONS).errors.name).toMatch(/Já existe/);
    const nearby = validateDraft({ ...valid, coords: offsetCoords(dulce.coords, 15, 0) }, SALVADOR_STATIONS);
    expect(nearby.ok).toBe(true);
    expect(nearby.warnings[0]).toMatch(/Posto Dulce/);
  });

  it('ignores the station being edited when checking duplicates', () => {
    const station = stationFromDraft(valid, 'user-x', 99);
    expect(validateDraft(valid, [station], 'user-x').ok).toBe(true);
    expect(validateDraft(valid, [station], null).errors.name).toBeDefined();
  });
});

describe('draft → station', () => {
  const station = stationFromDraft(valid, 'user-test', 44);

  it('produces a station the rest of the app understands', () => {
    expect(station.source).toBe('user');
    expect(station.hoursLabel).toBe('07:00 às 22:00');
    expect(station.parkingLabel).toContain('1ª h');
    expect(isCompatible(station, VEHICLE_BY_ID['phev'])).toBe(true);
    const est = estimateCharge({
      station,
      vehicle: VEHICLE_BY_ID['volvo-ex30'],
      connector: station.connectors[1],
      currentPct: 20,
      targetPct: 80,
      startHour: 10,
    });
    expect(est.energyCost).toBeGreaterThan(0);
    expect(est.parkingCost).toBe(10); // under 1 hour at 60 kW
  });

  it('round-trips through the edit form', () => {
    expect(draftFromStation(station)).toEqual({ ...valid, notes: '' });
  });
});
