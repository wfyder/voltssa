import type { Coordinates } from '../types';

export const TERRARIUM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const SAMPLE_ZOOM = 13;
const TILE_SIZE = 256;

/** Terrarium encoding: elevation = (R × 256 + G + B / 256) − 32768 */
export const decodeTerrarium = (r: number, g: number, b: number): number => r * 256 + g + b / 256 - 32768;

const tileCache = new Map<string, Promise<ImageData>>();

function loadTile(z: number, x: number, y: number): Promise<ImageData> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;

  const promise = new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('Canvas 2D indisponível'));
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE));
    };
    img.onerror = () => reject(new Error(`Falha ao carregar tile ${key}`));
    img.src = TERRARIUM_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  });
  tileCache.set(key, promise);
  promise.catch(() => tileCache.delete(key));
  return promise;
}

function project(c: Coordinates, z: number): { tx: number; ty: number; px: number; py: number } {
  const n = 2 ** z;
  const x = ((c.lng + 180) / 360) * n;
  const latRad = (c.lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return {
    tx,
    ty,
    px: Math.min(TILE_SIZE - 1, Math.floor((x - tx) * TILE_SIZE)),
    py: Math.min(TILE_SIZE - 1, Math.floor((y - ty) * TILE_SIZE)),
  };
}

/**
 * Offline fallback: a coarse model of Salvador's escarpment — Cidade Baixa (bay side)
 * sits near sea level, the plateau (Canela, Caminho das Árvores) at 50-80 m, the
 * Atlantic orla around 10-20 m.
 */
export function syntheticElevation(c: Coordinates): number {
  const escarpmentLng = -38.508 + (c.lat + 12.97) * 0.35;
  const distToBay = (c.lng - escarpmentLng) * 108_000; // meters east of the escarpment line
  const plateau = 62 + 12 * Math.sin(c.lat * 140) * Math.cos(c.lng * 120);
  const cliff = 1 / (1 + Math.exp(-distToBay / 140)); // steep ramp (Ladeira da Montanha / Contorno)
  const orlaDrop = Math.max(0, (-12.995 - c.lat) * 2600) + Math.max(0, (c.lng + 38.36) * 900);
  return Math.max(2, 4 + (plateau - 4) * cliff - orlaDrop);
}

export interface ElevationResult {
  elevations: number[];
  source: 'terrarium' | 'synthetic';
}

export async function sampleElevations(points: Coordinates[]): Promise<ElevationResult> {
  try {
    const elevations = await Promise.all(
      points.map(async (p) => {
        const { tx, ty, px, py } = project(p, SAMPLE_ZOOM);
        const tile = await loadTile(SAMPLE_ZOOM, tx, ty);
        const i = (py * TILE_SIZE + px) * 4;
        return decodeTerrarium(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
      }),
    );
    return { elevations: smooth(elevations.map((e) => Math.max(0, e))), source: 'terrarium' };
  } catch {
    return { elevations: points.map(syntheticElevation), source: 'synthetic' };
  }
}

/** Moving average — DEM pixels are noisy and would otherwise inflate the total ascent. */
function smooth(values: number[], window = 2): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window), Math.min(values.length, i + window + 1));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
