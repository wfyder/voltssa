import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import type { Coordinates, Vehicle } from '../types';
import { sampleElevations } from './elevation';
import { computeTopographyEnergy, type ProfilePoint, type TopographyEnergy } from './energy';
import { fallbackSteps, toRouteSteps, type OsrmStep, type RouteStep } from './navigation';
import { chooseRoute, type RouteEvaluation } from './routeChoice';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const MAX_SAMPLES = 80;
/** Alternatives requested from OSRM (it may return fewer). */
const ALTERNATIVES = 3;

/** One drivable option, with its relief profile and energy for the selected vehicle. */
export interface RouteOption {
  geometry: Feature<LineString>;
  distanceKm: number;
  durationMin: number;
  profile: ProfilePoint[];
  energy: TopographyEnergy;
  steps: RouteStep[];
}

/** The chosen option plus every alternative and why it won. */
export interface SmartRoute extends RouteOption {
  options: RouteOption[];
  evaluations: RouteEvaluation[];
  chosenIndex: number;
  choiceReason: string;
  /** True when the chosen option arrives with the reserve battery. */
  reachable: boolean;
  /** Index picked by the planner (the user may switch to another option). */
  recommendedIndex: number;
  routingSource: 'osrm' | 'fallback';
  elevationSource: 'terrarium' | 'synthetic';
}

interface BaseRoute {
  geometry: Feature<LineString>;
  distanceKm: number;
  durationMin: number;
  rawSteps: OsrmStep[] | null;
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: LineString; legs: { steps: OsrmStep[] }[] }[];
}

async function osrmRoute(points: Coordinates[], signal: AbortSignal | undefined, alternatives: boolean): Promise<BaseRoute[]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives ? ALTERNATIVES : 'false'}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error(`OSRM: ${data.code}`);
  return data.routes.slice(0, ALTERNATIVES).map((route) => ({
    geometry: turf.feature(route.geometry),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    rawSteps: stripViaSteps(route.legs.flatMap((l) => l.steps)),
  }));
}

/** A route through a via point has an extra arrive/depart pair in the middle; drop it. */
export function stripViaSteps(steps: OsrmStep[]): OsrmStep[] {
  return steps.filter((st, i) => {
    if (st.maneuver.type === 'arrive') return i === steps.length - 1;
    if (st.maneuver.type === 'depart') return i === 0;
    return true;
  });
}

/** Two detour points, one on each side of the straight line, to force different streets. */
export function viaPoints(from: Coordinates, to: Coordinates): Coordinates[] {
  const a = turf.point([from.lng, from.lat]);
  const b = turf.point([to.lng, to.lat]);
  const mid = turf.midpoint(a, b);
  const bearing = turf.bearing(a, b);
  const offsetKm = Math.min(2.5, Math.max(0.5, turf.distance(a, b, { units: 'kilometers' }) * 0.2));
  return [90, -90].map((turn) => {
    const [lng, lat] = turf.destination(mid, offsetKm, bearing + turn, { units: 'kilometers' }).geometry.coordinates;
    return { lat, lng };
  });
}

/** Detours longer than this (vs. the main route) are not worth offering. */
export const MAX_DETOUR_RATIO = 1.6;

/** Drops near-duplicates and absurd detours, keeping the main route first. */
export function dedupeRoutes<T extends { distanceKm: number; durationMin: number }>(routes: T[]): T[] {
  if (routes.length === 0) return routes;
  const main = routes[0];
  const kept: T[] = [main];
  for (const r of routes.slice(1)) {
    if (r.distanceKm > main.distanceKm * MAX_DETOUR_RATIO) continue;
    const twin = kept.some(
      (k) =>
        Math.abs(k.distanceKm - r.distanceKm) / k.distanceKm < 0.03 && Math.abs(k.durationMin - r.durationMin) / k.durationMin < 0.05,
    );
    if (!twin) kept.push(r);
  }
  return kept.slice(0, ALTERNATIVES);
}

/** OSRM alternatives, completed with via-point detours when the server returns only one route. */
async function fetchCandidates(from: Coordinates, to: Coordinates, signal?: AbortSignal): Promise<BaseRoute[]> {
  const primary = await osrmRoute([from, to], signal, true);
  if (primary.length >= 2) return dedupeRoutes(primary);
  const detours = await Promise.allSettled(viaPoints(from, to).map((via) => osrmRoute([from, via, to], signal, false)));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return dedupeRoutes([...primary, ...detours.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))]);
}

/** Straight line with a detour factor when OSRM is unreachable (offline / rate limit). */
function fallbackRoute(from: Coordinates, to: Coordinates): BaseRoute {
  const line = turf.lineString([
    [from.lng, from.lat],
    [to.lng, to.lat],
  ]);
  const distanceKm = turf.length(line, { units: 'kilometers' }) * 1.3;
  return { geometry: line, distanceKm, durationMin: (distanceKm / 25) * 60, rawSteps: null };
}

async function profileFor(base: BaseRoute): Promise<{ profile: ProfilePoint[]; source: 'terrarium' | 'synthetic' }> {
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
  return { profile: distances.map((distanceKm, i) => ({ distanceKm, elevationM: elevations[i] })), source };
}

/** Rebuilds the route around another option (when the driver picks an alternative). */
export function withOption(route: SmartRoute, index: number): SmartRoute {
  const option = route.options[index];
  if (!option) return route;
  return {
    ...route,
    ...option,
    chosenIndex: index,
    reachable: route.evaluations[index].reachable,
  };
}

/**
 * Plans a route for this vehicle and battery: fetches alternatives, samples the relief of
 * each one, computes the energy (mass × climbs, regeneration on descents) and lets
 * `chooseRoute` pick the best trade-off between time and battery.
 */
export async function buildSmartRoute(
  from: Coordinates,
  to: Coordinates,
  vehicle: Vehicle,
  batteryPct: number,
  signal?: AbortSignal,
  destinationName = 'o destino',
): Promise<SmartRoute> {
  let bases: BaseRoute[];
  let routingSource: SmartRoute['routingSource'] = 'osrm';
  try {
    bases = await fetchCandidates(from, to, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    bases = [fallbackRoute(from, to)];
    routingSource = 'fallback';
  }

  const profiled = await Promise.all(bases.map(profileFor));
  const options: RouteOption[] = bases.map((base, i) => {
    const lineKm = turf.length(base.geometry, { units: 'kilometers' });
    return {
      geometry: base.geometry,
      distanceKm: base.distanceKm,
      durationMin: base.durationMin,
      profile: profiled[i].profile,
      energy: computeTopographyEnergy(vehicle, profiled[i].profile),
      steps: base.rawSteps ? toRouteSteps(base.rawSteps, lineKm, destinationName) : fallbackSteps(base.geometry, destinationName),
    };
  });

  const decision = chooseRoute(options, vehicle, batteryPct);
  const chosen = options[decision.index];
  return {
    ...chosen,
    options,
    evaluations: decision.evaluations,
    chosenIndex: decision.index,
    recommendedIndex: decision.index,
    choiceReason: decision.reason,
    reachable: decision.reachable,
    routingSource,
    elevationSource: profiled.some((p) => p.source === 'synthetic') ? 'synthetic' : 'terrarium',
  };
}
