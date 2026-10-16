import { describe, expect, it } from 'vitest';
import { SALVADOR_STATIONS, STATION_BY_ID } from '../data/salvadorStations';
import { CAR_LIST_LIMIT, rankCarStations } from './carMode';
import { hasDcFast, isFree } from './compatibility';
import { distanceMeters } from './geo';
import { errorCodeFrom, salvadorProximity } from './geolocation';

describe('GPS position vs. Salvador', () => {
  it('classifies the city, the metro area and far away', () => {
    expect(salvadorProximity({ lat: -12.9786, lng: -38.4552 }).proximity).toBe('inside'); // Tancredo Neves
    expect(salvadorProximity({ lat: -12.71, lng: -38.33 }).proximity).toBe('metro'); // Camaçari
    const sp = salvadorProximity({ lat: -23.55, lng: -46.63 }); // São Paulo
    expect(sp.proximity).toBe('far');
    expect(sp.distanceKm).toBeGreaterThan(1000);
  });

  it('maps browser geolocation errors', () => {
    const err = (code: number) => ({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' }) as GeolocationPositionError;
    expect(errorCodeFrom(err(1))).toBe('denied');
    expect(errorCodeFrom(err(2))).toBe('unavailable');
    expect(errorCodeFrom(err(3))).toBe('timeout');
  });
});

describe('car mode station list', () => {
  const here = STATION_BY_ID['salvador-shopping'].coords;
  const views = SALVADOR_STATIONS.map((station) => ({
    station,
    block: station.initialStatus === 'maintenance' ? 'maintenance' : null,
    distanceM: distanceMeters(here, station.coords),
  }));

  it('only offers usable stations, nearest first, capped for a car screen', () => {
    const rows = rankCarStations(views, 'near');
    expect(rows).toHaveLength(CAR_LIST_LIMIT);
    expect(rows.every((r) => r.block === null)).toBe(true);
    expect(rows[0].station.id).toBe('salvador-shopping');
    for (let i = 1; i < rows.length; i++) expect(rows[i].distanceM).toBeGreaterThanOrEqual(rows[i - 1].distanceM);
  });

  it('filters fast DC and free stations', () => {
    expect(rankCarStations(views, 'fast').every((r) => hasDcFast(r.station))).toBe(true);
    expect(rankCarStations(views, 'free').every((r) => isFree(r.station))).toBe(true);
    expect(rankCarStations(views, 'near', 50).some((r) => r.station.id === 'leroy-merlin')).toBe(false);
  });
});
