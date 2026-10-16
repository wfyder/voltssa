import * as turf from '@turf/turf';
import { describe, expect, it } from 'vitest';
import { buildCarModel, carLengthForZoom, metersPerPixel } from './car3d';

const center = { lat: -12.9718, lng: -38.5128 };
const centroidOf = (model: ReturnType<typeof buildCarModel>, part: string) =>
  turf.centroid(model.features.find((f) => f.properties.part === part)!).geometry.coordinates;

describe('3D car miniature', () => {
  it('has body, glass cabin, roof, four wheels and lights', () => {
    const parts = buildCarModel(center, 0, 10).features.map((f) => f.properties.part);
    expect(parts).toEqual(expect.arrayContaining(['body', 'cabin', 'roof', 'headlight-l', 'taillight-r']));
    expect(parts.filter((p) => p.startsWith('wheel'))).toHaveLength(4);
  });

  it('stacks parts upward and scales heights with the length', () => {
    const model = buildCarModel(center, 0, 10);
    const get = (part: string) => model.features.find((f) => f.properties.part === part)!.properties;
    expect(get('roof').height).toBeGreaterThan(get('cabin').height);
    expect(get('cabin').height).toBeGreaterThan(get('body').height);
    expect(get('roof').height).toBeCloseTo(3.4, 5);
  });

  it('points the headlights along the heading', () => {
    for (const heading of [0, 90, 225]) {
      const model = buildCarModel(center, heading, 40);
      const bearing = turf.bearing(centroidOf(model, 'taillight-l'), centroidOf(model, 'headlight-l'));
      expect(Math.abs((((bearing - heading) % 360) + 540) % 360 - 180)).toBeLessThan(2);
    }
  });

  it('keeps a constant on-screen size across zoom levels', () => {
    expect(carLengthForZoom(16, center.lat) / carLengthForZoom(17, center.lat)).toBeCloseTo(2, 5);
    expect(carLengthForZoom(17, center.lat)).toBeCloseTo(46 * metersPerPixel(17, center.lat), 5);
    expect(carLengthForZoom(22, center.lat)).toBe(4.5); // never smaller than a real car
  });
});
