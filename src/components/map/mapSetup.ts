import { addProtocol, type Map as MaplibreMap } from 'maplibre-gl';
import type { MapRef } from 'react-map-gl/maplibre';
import { TERRARIUM_TILES } from '../../lib/elevation';

/**
 * Terrarium tiles carry bathymetry: the bay floor is negative. With 1.8× exaggeration the
 * water surface ends up at the bottom of a pit with black walls along the shore (Cidade
 * Baixa, Bahia Marina). This protocol re-encodes every pixel below sea level as 0 m.
 */
const LAND_DEM_PROTOCOL = 'terrarium-land';

addProtocol(LAND_DEM_PROTOCOL, async (params, abortController) => {
  const url = params.url.replace(`${LAND_DEM_PROTOCOL}://`, 'https://');
  const res = await fetch(url, { signal: abortController.signal });
  if (!res.ok) throw new Error(`DEM HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('OffscreenCanvas 2D indisponível');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  // elevation = R·256 + G + B/256 − 32768, so it is negative exactly when R < 128.
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] < 128) {
      px[i] = 128;
      px[i + 1] = 0;
      px[i + 2] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { data: await blob.arrayBuffer() };
});

const LAND_DEM_TILES = TERRARIUM_TILES.replace('https://', `${LAND_DEM_PROTOCOL}://`);

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const TERRAIN_EXAGGERATION = 1.8;
export const BUILDINGS_LAYER_ID = 'salvador-buildings-3d';

/** Shared handle so panels outside the map tree can drive the camera. */
export const mapHandle: { current: MapRef | null } = { current: null };

const TERRAIN_SOURCE = 'terrain-dem';
const HILLSHADE_SOURCE = 'hillshade-dem';

function demSource() {
  return {
    type: 'raster-dem' as const,
    tiles: [LAND_DEM_TILES],
    encoding: 'terrarium' as const,
    tileSize: 256,
    maxzoom: 15,
    attribution: 'Elevação: Mapzen Terrarium / AWS Open Data',
  };
}

/** Adds 3D terrain (AWS Terrarium), hillshade and a custom fill-extrusion layer for buildings. */
export function setupTerrainAndBuildings(map: MaplibreMap): void {
  if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, demSource());
  if (!map.getSource(HILLSHADE_SOURCE)) map.addSource(HILLSHADE_SOURCE, demSource());

  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION });

  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

  if (!map.getLayer('salvador-hillshade')) {
    map.addLayer(
      {
        id: 'salvador-hillshade',
        type: 'hillshade',
        source: HILLSHADE_SOURCE,
        paint: {
          'hillshade-exaggeration': 0.35,
          'hillshade-shadow-color': '#6b6b6b',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#8a8a8a',
        },
      },
      firstSymbol,
    );
  }

  // Replace the style's own extrusion with ours (neutral tones, visible from zoom 12.5).
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'fill-extrusion' && layer.id !== BUILDINGS_LAYER_ID) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
  const vectorSource = Object.entries(map.getStyle().sources).find(([, s]) => s.type === 'vector')?.[0];
  if (vectorSource && !map.getLayer(BUILDINGS_LAYER_ID)) {
    map.addLayer(
      {
        id: BUILDINGS_LAYER_ID,
        type: 'fill-extrusion',
        source: vectorSource,
        'source-layer': 'building',
        minzoom: 12.5,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 8],
            0,
            '#e7e5e4',
            40,
            '#d6d3d1',
            120,
            '#a8a29e',
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        },
      },
      firstSymbol,
    );
  }

  try {
    map.setSky({
      'sky-color': '#1a1a1a',
      'horizon-color': '#2a2a2a',
      'fog-color': '#1a1a1a',
      'sky-horizon-blend': 0.5,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.35,
      'atmosphere-blend': 0,
    });
  } catch {
    /* sky is cosmetic */
  }
}

/* -------------------------------------------------------------------------- */
/*  Optional night theme over the Liberty style — reversible                   */
/* -------------------------------------------------------------------------- */

type PaintProp = Parameters<MaplibreMap['setPaintProperty']>[1];
type PaintValue = Parameters<MaplibreMap['setPaintProperty']>[2];
type PaintBackup = Map<string, Map<PaintProp, PaintValue>>;
const backups = new WeakMap<MaplibreMap, PaintBackup>();

function setPaint(map: MaplibreMap, layerId: string, prop: PaintProp, value: PaintValue, backup: PaintBackup) {
  try {
    const layerBackup = backup.get(layerId) ?? new Map<PaintProp, PaintValue>();
    if (!layerBackup.has(prop)) layerBackup.set(prop, map.getPaintProperty(layerId, prop) as PaintValue);
    backup.set(layerId, layerBackup);
    map.setPaintProperty(layerId, prop, value);
  } catch {
    /* property not supported by this layer */
  }
}

export function applyNightTheme(map: MaplibreMap): void {
  const backup: PaintBackup = backups.get(map) ?? new Map();
  backups.set(map, backup);

  for (const layer of map.getStyle().layers) {
    const id = layer.id;
    if (id.startsWith('ev-')) continue;
    if (id === BUILDINGS_LAYER_ID) {
      setPaint(map, id, 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#262626', 120, '#525252'], backup);
      continue;
    }
    if (id === 'salvador-hillshade') {
      setPaint(map, id, 'hillshade-shadow-color', '#000000', backup);
      setPaint(map, id, 'hillshade-highlight-color', '#404040', backup);
      continue;
    }
    switch (layer.type) {
      case 'background':
        setPaint(map, id, 'background-color', '#121212', backup);
        break;
      case 'fill':
        if (/water/.test(id)) setPaint(map, id, 'fill-color', '#1c2227', backup);
        else if (/park|wood|grass|forest|scrub|wetland|landcover/.test(id)) setPaint(map, id, 'fill-color', '#18191a', backup);
        else if (/building/.test(id)) setPaint(map, id, 'fill-color', '#202020', backup);
        else setPaint(map, id, 'fill-color', '#161616', backup);
        break;
      case 'line':
        if (/casing/.test(id)) setPaint(map, id, 'line-color', '#0d0d0d', backup);
        else if (/water/.test(id)) setPaint(map, id, 'line-color', '#252c33', backup);
        else if (/motorway|trunk/.test(id)) setPaint(map, id, 'line-color', '#5a5a5a', backup);
        else if (/primary|secondary/.test(id)) setPaint(map, id, 'line-color', '#454545', backup);
        else if (/road|street|minor|service|tertiary|bridge|tunnel|path|track/.test(id))
          setPaint(map, id, 'line-color', '#303030', backup);
        else if (/rail/.test(id)) setPaint(map, id, 'line-color', '#3a3a3a', backup);
        else if (/boundary|admin/.test(id)) setPaint(map, id, 'line-color', '#555555', backup);
        break;
      case 'symbol':
        setPaint(map, id, 'text-color', '#bdbdbd', backup);
        setPaint(map, id, 'text-halo-color', '#121212', backup);
        setPaint(map, id, 'text-halo-width', 1.2, backup);
        break;
      default:
        break;
    }
  }
}

export function removeNightTheme(map: MaplibreMap): void {
  const backup = backups.get(map);
  if (!backup) return;
  for (const [layerId, props] of backup) {
    for (const [prop, value] of props) {
      try {
        map.setPaintProperty(layerId, prop, value);
      } catch {
        /* layer may have been removed */
      }
    }
  }
  backups.delete(map);
}
