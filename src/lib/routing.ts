import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import type { Coordinates, Vehicle } from '../types';
import { sampleElevations } from './elevation';
import { computeTopographyEnergy, type ProfilePoint, type TopographyEnergy } from './energy';
import { fallbackSteps, toRouteSteps, type OsrmStep, type RouteStep } from './navigation';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const MAX_SAMPLES = 80;

export interface SmartRoute {
  geometry: Feature<LineString>;
  distanceKm: number;
  durationMin: number;
  profile: ProfilePoint[];
  energy: TopographyEnergy;
  steps: RouteStep[];
  routingSource: 'osrm' | 'fallback';
  elevationSource: 'terrarium' | 'synthetic';
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: LineString; legs: { steps: OsrmStep[] }[] }[];
}

async function fetchOsrm(from: Coordinates, to: Coordinates, signal?: AbortSignal) {
  const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route) throw new Error(`OSRM: ${data.code}`);
  return {
    geometry: turf.feature(route.geometry),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    rawSteps: route.legs.flatMap((l) => l.steps),
  };
}

/** Straight line with a detour factor when OSRM is unreachable (offline / rate limit). */
function fallbackRoute(from: Coordinates, to: Coordinates) {
  const line = turf.lineString([
    [from.lng, from.lat],
    [to.lng, to.lat],
  ]);
  const distanceKm = turf.length(line, { units: 'kilometers' }) * 1.3;
  return { geometry: line, distanceKm, durationMin: (distanceKm / 25) * 60, rawSteps: null };
}

export async function buildSmartRoute(
  from: Coordinates,
  to: Coordinates,
  vehicle: Vehicle,
  signal?: AbortSignal,
  destinationName = 'o destino',
): Promise<SmartRoute> {
  let base: { geometry: Feature<LineString>; distanceKm: number; durationMin: number; rawSteps: OsrmStep[] | null };
  let routingSource: SmartRoute['routingSource'] = 'osrm';
  try {
    base = await fetchOsrm(from, to, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    base = fallbackRoute(from, to);
    routingSource = 'fallback';
  }

  const lineKm = turf.length(base.geometry, { units: 'kilometers' });
  const samples = Math.max(2, Math.min(MAX_SAMPLES, Math.ceil(lineKm / 0.08)));
  const points: Coordinates[] = [];
  const distances: number[] = [];
  for (let i = 0; i < samples; i++) {
    const d = (lineKm * i) / (samples - 1);
    const [lng, lat] = turf.along(base.geometry, d, { units: 'kilometers' }).geometry.coordinates;
    points.push({ lat, lng });
    // Scale to the routed distance so the profile x-axis matches the reported km.
    distances.push(lineKm > 0 ? (d / lineKm) * base.distanceKm : 0);
  }

  const { elevations, source } = await sampleElevations(points);
  const profile = distances.map((distanceKm, i) => ({ distanceKm, elevationM: elevations[i] }));

  return {
    geometry: base.geometry,
    distanceKm: base.distanceKm,
    durationMin: base.durationMin,
    profile,
    energy: computeTopographyEnergy(vehicle, profile),
    steps: base.rawSteps
      ? toRouteSteps(base.rawSteps, lineKm, destinationName)
      : fallbackSteps(base.geometry, destinationName),
    routingSource,
    elevationSource: source,
  };
}
