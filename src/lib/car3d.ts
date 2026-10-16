import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Coordinates } from '../types';

/**
 * Low-poly 3D car built from fill-extrusion parts (same technique as the 3D buildings),
 * so it shades, tilts with the camera and sits on the terrain without extra libraries.
 *
 * Parts are described in car-local units of the car length L:
 * x → right, y → forward, base/height → up.
 */
export interface CarPartProps {
  part: string;
  color: string;
  base: number;
  height: number;
}

export type CarModel = FeatureCollection<Polygon, CarPartProps>;

/** Width / length of the miniature. */
const W = 0.44;

interface PartSpec {
  part: string;
  color: string;
  /** Outline in [x, y] (fractions of L). */
  outline: [number, number][];
  base: number;
  height: number;
}

const box = (x0: number, x1: number, y0: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Rectangle with chamfered corners (car body silhouette seen from above). */
const chamfered = (hw: number, y0: number, y1: number, c: number): [number, number][] => [
  [-hw + c, y0],
  [hw - c, y0],
  [hw, y0 + c],
  [hw, y1 - c],
  [hw - c, y1],
  [-hw + c, y1],
  [-hw, y1 - c],
  [-hw, y0 + c],
];

const BODY = '#facc15';
const GLASS = '#1c1c1c';
const TIRE = '#0b0b0b';

const PARTS: PartSpec[] = [
  // tyres
  ...[-1, 1].flatMap((side) =>
    [-0.3, 0.3].map((y) => ({
      part: `wheel-${side > 0 ? 'r' : 'l'}${y > 0 ? 'f' : 'b'}`,
      color: TIRE,
      outline: box(side * (W / 2) - 0.06, side * (W / 2) + 0.06, y - 0.1, y + 0.1),
      base: 0,
      height: 0.15,
    })),
  ),
  { part: 'body', color: BODY, outline: chamfered(W / 2, -0.5, 0.5, 0.06), base: 0.05, height: 0.2 },
  { part: 'cabin', color: GLASS, outline: chamfered(W * 0.42, -0.24, 0.2, 0.05), base: 0.2, height: 0.31 },
  { part: 'roof', color: BODY, outline: chamfered(W * 0.38, -0.18, 0.12, 0.04), base: 0.31, height: 0.34 },
  // headlights (front) and taillights (back)
  ...[-1, 1].map((side) => ({
    part: `headlight-${side > 0 ? 'r' : 'l'}`,
    color: '#fffbe6',
    outline: box(side * W * 0.3 - 0.05, side * W * 0.3 + 0.05, 0.47, 0.51),
    base: 0.11,
    height: 0.17,
  })),
  ...[-1, 1].map((side) => ({
    part: `taillight-${side > 0 ? 'r' : 'l'}`,
    color: '#ef4444',
    outline: box(side * W * 0.3 - 0.05, side * W * 0.3 + 0.05, -0.51, -0.47),
    base: 0.12,
    height: 0.18,
  })),
];

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQUATOR = 111_320;

/** Ground resolution of a web-mercator map, in metres per CSS pixel. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Car length in metres so it keeps roughly `px` pixels on screen at any zoom. */
export function carLengthForZoom(zoom: number, lat: number, px = 46): number {
  return Math.max(4.5, px * metersPerPixel(zoom, lat));
}

/** Builds the car at `center`, facing `headingDeg` (clockwise from north), `lengthM` long. */
export function buildCarModel(center: Coordinates, headingDeg: number, lengthM: number): CarModel {
  const h = (headingDeg * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  const mPerDegLng = M_PER_DEG_LNG_EQUATOR * Math.cos((center.lat * Math.PI) / 180);

  const toLngLat = ([x, y]: [number, number]): [number, number] => {
    const right = x * lengthM;
    const forward = y * lengthM;
    const east = right * cos + forward * sin;
    const north = -right * sin + forward * cos;
    return [center.lng + east / mPerDegLng, center.lat + north / M_PER_DEG_LAT];
  };

  const features: Feature<Polygon, CarPartProps>[] = PARTS.map((p) => {
    const ring = p.outline.map(toLngLat);
    ring.push(ring[0]);
    return {
      type: 'Feature',
      properties: { part: p.part, color: p.color, base: p.base * lengthM, height: p.height * lengthM },
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
  });
  return { type: 'FeatureCollection', features };
}
