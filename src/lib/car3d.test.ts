import { describe, expect, it } from 'vitest';
import { carBasis, carLengthForZoom, carModelMatrix, CAR_MODEL_LENGTH_M, CAR_SCREEN_PX, metersPerPixel } from './car3d';

const lat = -12.9718;
const apply = (m: number[], [x, y, z]: [number, number, number]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

describe('3D car placement', () => {
  it('faces north/east/south/west in mercator space (y grows southward)', () => {
    const fwd = (h: number) => carBasis(h).forward.map((v) => Math.round(v * 1000) / 1000 + 0);
    expect(fwd(0)).toEqual([0, -1, 0]); // north
    expect(fwd(90)).toEqual([1, 0, 0]); // east
    expect(fwd(180)).toEqual([0, 1, 0]); // south
    expect(fwd(270)).toEqual([-1, 0, 0]); // west
  });

  it('keeps right perpendicular to forward and up pointing to the sky', () => {
    for (const h of [0, 37, 145, 300]) {
      const { right, up, forward } = carBasis(h);
      expect(right[0] * forward[0] + right[1] * forward[1]).toBeCloseTo(0, 10);
      expect(up).toEqual([0, 0, 1]);
      // right is the forward vector turned 90° clockwise (seen from above).
      expect(carBasis(h + 90).forward[0]).toBeCloseTo(right[0], 10);
      expect(carBasis(h + 90).forward[1]).toBeCloseTo(right[1], 10);
    }
  });

  it('maps the model into mercator space at the car position', () => {
    const m = carModelMatrix(90, [0.4, 0.6, 0.001], 2);
    expect(apply(m, [0, 0, 0])).toEqual([0.4, 0.6, 0.001]);
    const nose = apply(m, [0, 0, 1]); // 1 m forward, heading east
    expect(nose[0]).toBeCloseTo(2.4, 10);
    expect(nose[1]).toBeCloseTo(0.6, 10);
    const roof = apply(m, [0, 1, 0]);
    expect(roof[2]).toBeCloseTo(2.001, 10);
  });

  it('keeps a constant on-screen size across zoom levels', () => {
    expect(carLengthForZoom(16, lat) / carLengthForZoom(17, lat)).toBeCloseTo(2, 5);
    expect(carLengthForZoom(17, lat)).toBeCloseTo(CAR_SCREEN_PX * metersPerPixel(17, lat), 5);
    expect(carLengthForZoom(22, lat)).toBe(CAR_MODEL_LENGTH_M); // never smaller than a real car
  });
});
