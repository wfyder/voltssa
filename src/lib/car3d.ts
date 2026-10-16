/**
 * Geometry helpers for the 3D car miniature (rendered with Three.js inside MapLibre).
 * Pure functions — no WebGL here — so they are unit-testable.
 */

/** Real length of the Three.js model, in model units (metres). */
export const CAR_MODEL_LENGTH_M = 4.4;

/** Ground resolution of a web-mercator map, in metres per CSS pixel. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** On-screen length of the car miniature, in CSS pixels. */
export const CAR_SCREEN_PX = 60;

/** Car length in metres so it keeps roughly `px` pixels on screen at any zoom. */
export function carLengthForZoom(zoom: number, lat: number, px = CAR_SCREEN_PX): number {
  return Math.max(CAR_MODEL_LENGTH_M, px * metersPerPixel(zoom, lat));
}

export type Vec3 = [number, number, number];

/**
 * Axes of the car expressed in MapLibre mercator space (x → east, y → south, z → up)
 * for a heading in degrees clockwise from north.
 * The model is authored with x → right, y → up, z → forward.
 */
export function carBasis(headingDeg: number): { right: Vec3; up: Vec3; forward: Vec3 } {
  const h = (headingDeg * Math.PI) / 180;
  const c = Math.cos(h);
  const s = Math.sin(h);
  return {
    // heading + 90°: east = cos h, north = −sin h → south = +sin h
    right: [c, s, 0],
    up: [0, 0, 1],
    // heading: east = sin h, north = cos h → south = −cos h
    forward: [s, -c, 0],
  };
}

/**
 * Column-major 4×4 matrix mapping model coordinates (metres) to mercator coordinates:
 * `scale` converts model metres to mercator units, `origin` is the car position.
 */
export function carModelMatrix(headingDeg: number, origin: Vec3, scale: number): number[] {
  const { right, up, forward } = carBasis(headingDeg);
  return [
    right[0] * scale, right[1] * scale, right[2] * scale, 0,
    up[0] * scale, up[1] * scale, up[2] * scale, 0,
    forward[0] * scale, forward[1] * scale, forward[2] * scale, 0,
    origin[0], origin[1], origin[2], 1,
  ];
}
