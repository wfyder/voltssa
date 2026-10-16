import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { Coordinates, Station, Vehicle } from '../types';

/** Anti-fraud radius: crowd reports of a broken charger must come from within this distance. */
export const FRAUD_RADIUS_M = 100;

export const toPoint = (c: Coordinates): Feature<Point> => turf.point([c.lng, c.lat]);

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  return turf.distance(toPoint(a), toPoint(b), { units: 'kilometers' }) * 1000;
}

/** Remaining range on flat road, in km. */
export function autonomyKm(vehicle: Vehicle, batteryPct: number): number {
  return (vehicle.batteryKwh * (batteryPct / 100)) / vehicle.consumptionKwhPerKm;
}

export function autonomyCircle(center: Coordinates, radiusKm: number): Feature<Polygon> {
  return turf.circle([center.lng, center.lat], Math.max(radiusKm, 0.05), { steps: 96, units: 'kilometers' });
}

export function stationsToFeatureCollection(
  stations: Station[],
  weight: (s: Station) => number,
): FeatureCollection<Point, { id: string; weight: number }> {
  return turf.featureCollection(
    stations.map((s) => turf.point([s.coords.lng, s.coords.lat], { id: s.id, weight: weight(s) })),
  );
}

/** Nearest station (turf.nearestPoint) among the candidates. */
export function nearestStation(
  from: Coordinates,
  candidates: Station[],
): { station: Station; distanceM: number } | null {
  if (candidates.length === 0) return null;
  const fc = stationsToFeatureCollection(candidates, () => 1);
  const nearest = turf.nearestPoint(toPoint(from), fc, { units: 'kilometers' });
  const station = candidates.find((s) => s.id === nearest.properties.id);
  if (!station) return null;
  return { station, distanceM: nearest.properties.distanceToPoint * 1000 };
}

/** Offset a coordinate by `meters` towards `bearingDeg` — used to simulate on-site presence. */
export function offsetCoords(c: Coordinates, meters: number, bearingDeg: number): Coordinates {
  const dest = turf.destination([c.lng, c.lat], meters / 1000, bearingDeg, { units: 'kilometers' });
  const [lng, lat] = dest.geometry.coordinates;
  return { lat, lng };
}
