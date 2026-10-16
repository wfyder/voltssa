import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import type { Coordinates } from '../types';

/** Distance from the route line that counts as "left the route" and triggers a reroute. */
export const OFF_ROUTE_M = 50;
/** Distance to the destination that counts as arrival. */
export const ARRIVAL_M = 25;

export type ManeuverType =
  | 'depart'
  | 'arrive'
  | 'turn'
  | 'new name'
  | 'continue'
  | 'merge'
  | 'on ramp'
  | 'off ramp'
  | 'fork'
  | 'end of road'
  | 'roundabout'
  | 'rotary'
  | 'roundabout turn'
  | 'exit roundabout'
  | 'exit rotary'
  | 'notification'
  | 'use lane';

export type ManeuverModifier =
  | 'uturn'
  | 'sharp right'
  | 'right'
  | 'slight right'
  | 'straight'
  | 'slight left'
  | 'left'
  | 'sharp left';

export interface RouteStep {
  type: ManeuverType;
  modifier: ManeuverModifier | null;
  exit: number | null;
  name: string;
  location: Coordinates;
  distanceM: number;
  durationS: number;
  /** Where the maneuver happens, measured along the route geometry (km). */
  startKm: number;
  instruction: string;
}

/** Raw step as returned by OSRM with `steps=true`. */
export interface OsrmStep {
  name: string;
  distance: number;
  duration: number;
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] };
}

const DIRECTION: Record<ManeuverModifier, string> = {
  uturn: 'Faça o retorno',
  'sharp right': 'Vire acentuadamente à direita',
  right: 'Vire à direita',
  'slight right': 'Mantenha-se à direita',
  straight: 'Siga em frente',
  'slight left': 'Mantenha-se à esquerda',
  left: 'Vire à esquerda',
  'sharp left': 'Vire acentuadamente à esquerda',
};

const SIDE = (m: ManeuverModifier | null): string => (m?.includes('left') ? 'à esquerda' : m?.includes('right') ? 'à direita' : '');

/** Portuguese instruction for an OSRM maneuver. */
export function buildInstruction(
  step: Pick<RouteStep, 'type' | 'modifier' | 'exit' | 'name'>,
  destinationName = 'o destino',
): string {
  const on = step.name ? ` na ${step.name}` : '';
  const towards = step.name ? ` para ${step.name}` : '';
  const dir = step.modifier ? DIRECTION[step.modifier] : 'Siga';
  switch (step.type) {
    case 'depart':
      return step.name ? `Siga pela ${step.name}` : 'Siga em frente';
    case 'arrive':
      return `Você chegou a ${destinationName}`;
    case 'new name':
    case 'continue':
      if (step.modifier === 'uturn') return `Faça o retorno${towards}`;
      if (step.modifier && step.modifier !== 'straight') return `${dir}${towards}`;
      return step.name ? `Continue pela ${step.name}` : 'Continue em frente';
    case 'merge':
      return step.name ? `Entre na ${step.name}` : `Entre na via ${SIDE(step.modifier)}`.trim();
    case 'on ramp':
      return `Pegue o acesso ${SIDE(step.modifier)}${towards}`.replace('  ', ' ');
    case 'off ramp':
      return `Pegue a saída ${SIDE(step.modifier)}${towards}`.replace('  ', ' ');
    case 'fork':
      return `Na bifurcação, mantenha-se ${SIDE(step.modifier) || 'em frente'}${towards}`;
    case 'end of road':
      return `No fim da via, vire ${SIDE(step.modifier)}${towards}`;
    case 'roundabout':
    case 'rotary':
      return step.exit ? `Na rotatória, pegue a ${step.exit}ª saída${towards}` : `Entre na rotatória${towards}`;
    case 'roundabout turn':
      return `Na rotatória, ${dir.toLowerCase()}${towards}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Saia da rotatória${towards}`;
    default:
      return `${dir}${on}`;
  }
}

/** Converts OSRM steps into navigation steps aligned with the route geometry. */
export function toRouteSteps(raw: OsrmStep[], lineKm: number, destinationName: string): RouteStep[] {
  const totalM = raw.reduce((sum, s) => sum + s.distance, 0) || 1;
  // OSRM step distances and the geometry length differ slightly; scale to the geometry.
  const scale = lineKm / (totalM / 1000);
  let cumulativeKm = 0;
  return raw.map((s) => {
    const step = {
      type: s.maneuver.type as ManeuverType,
      modifier: (s.maneuver.modifier as ManeuverModifier | undefined) ?? null,
      exit: s.maneuver.exit ?? null,
      name: s.name,
      location: { lng: s.maneuver.location[0], lat: s.maneuver.location[1] },
      distanceM: s.distance,
      durationS: s.duration,
      startKm: cumulativeKm,
      instruction: '',
    };
    step.instruction = buildInstruction(step, destinationName);
    cumulativeKm += (s.distance / 1000) * scale;
    return step;
  });
}

/** Single-step plan when OSRM is unreachable. */
export function fallbackSteps(line: Feature<LineString>, destinationName: string): RouteStep[] {
  const coords = line.geometry.coordinates;
  const [sLng, sLat] = coords[0];
  const [eLng, eLat] = coords[coords.length - 1];
  const lineKm = turf.length(line, { units: 'kilometers' });
  return [
    { type: 'depart', modifier: null, exit: null, name: '', location: { lng: sLng, lat: sLat }, distanceM: lineKm * 1000, durationS: 0, startKm: 0, instruction: `Siga em direção a ${destinationName}` },
    { type: 'arrive', modifier: null, exit: null, name: '', location: { lng: eLng, lat: eLat }, distanceM: 0, durationS: 0, startKm: lineKm, instruction: `Você chegou a ${destinationName}` },
  ];
}

export interface NavProgress {
  /** Position snapped onto the route. */
  snapped: Coordinates;
  alongKm: number;
  offRouteM: number;
  /** Index of the step being driven (its maneuver is behind us). */
  stepIndex: number;
  /** Maneuver ahead, or null on the last stretch. */
  next: RouteStep | null;
  distanceToNextM: number;
  remainingKm: number;
  remainingMin: number;
  /** 0..1 share of the route already driven. */
  progress: number;
  arrived: boolean;
}

/** Where the driver is on the route, which maneuver comes next and how much is left. */
export function computeProgress(
  line: Feature<LineString>,
  steps: RouteStep[],
  totalDurationMin: number,
  position: Coordinates,
): NavProgress {
  const lineKm = turf.length(line, { units: 'kilometers' });
  const snappedPt = turf.nearestPointOnLine(line, [position.lng, position.lat], { units: 'kilometers' });
  const alongKm = Math.min(lineKm, snappedPt.properties.totalDistance);
  const offRouteM = snappedPt.properties.pointDistance * 1000;
  const [lng, lat] = snappedPt.geometry.coordinates;

  let stepIndex = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].startKm <= alongKm + 1e-6) stepIndex = i;
  }
  // The "arrive" maneuver is the end point, never the step being driven.
  if (steps[stepIndex]?.type === 'arrive' && stepIndex > 0) stepIndex -= 1;
  const next = steps[stepIndex + 1] ?? null;
  const distanceToNextM = next ? Math.max(0, (next.startKm - alongKm) * 1000) : Math.max(0, (lineKm - alongKm) * 1000);

  const remainingKm = Math.max(0, lineKm - alongKm);
  const progress = lineKm > 0 ? alongKm / lineKm : 1;
  const destination = line.geometry.coordinates[line.geometry.coordinates.length - 1];
  const toDestinationM = turf.distance([position.lng, position.lat], destination, { units: 'kilometers' }) * 1000;

  return {
    snapped: { lng, lat },
    alongKm,
    offRouteM,
    stepIndex,
    next,
    distanceToNextM,
    remainingKm,
    remainingMin: totalDurationMin * (1 - progress),
    progress,
    arrived: toDestinationM <= ARRIVAL_M || remainingKm * 1000 <= ARRIVAL_M,
  };
}

/** Point and heading at `km` along the route — drives the simulated car. */
export function pointAlong(line: Feature<LineString>, km: number): { coords: Coordinates; heading: number } {
  const lineKm = turf.length(line, { units: 'kilometers' });
  const d = Math.max(0, Math.min(lineKm, km));
  const here = turf.along(line, d, { units: 'kilometers' });
  const ahead = turf.along(line, Math.min(lineKm, d + 0.015), { units: 'kilometers' });
  const behind = turf.along(line, Math.max(0, d - 0.015), { units: 'kilometers' });
  const heading = d + 0.015 <= lineKm ? turf.bearing(here, ahead) : turf.bearing(behind, here);
  const [lng, lat] = here.geometry.coordinates;
  return { coords: { lng, lat }, heading };
}

/** Rounded distance as a driver hears it: "300 m", "1,2 km". */
export function spokenDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  if (meters >= 100) return `${Math.round(meters / 50) * 50} m`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}
