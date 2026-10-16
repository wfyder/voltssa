import type { Coordinates } from '../types';

export const SALVADOR_CENTER: Coordinates = { lat: -12.9777, lng: -38.4516 };

/** Approximate bounding box of the municipality of Salvador (used to validate new stations). */
export const SALVADOR_BOUNDS = { minLat: -13.02, maxLat: -12.78, minLng: -38.56, maxLng: -38.3 };

export const isInsideSalvador = (c: Coordinates): boolean =>
  c.lat >= SALVADOR_BOUNDS.minLat && c.lat <= SALVADOR_BOUNDS.maxLat && c.lng >= SALVADOR_BOUNDS.minLng && c.lng <= SALVADOR_BOUNDS.maxLng;

export const INITIAL_VIEW = {
  latitude: SALVADOR_CENTER.lat,
  longitude: SALVADOR_CENTER.lng,
  zoom: 12.2,
  pitch: 60,
  bearing: -15,
};

export interface FlyToRegion {
  id: string;
  label: string;
  coords: Coordinates;
  zoom: number;
}

export const FLY_TO_REGIONS: FlyToRegion[] = [
  { id: 'barra', label: 'Barra', coords: { lat: -13.0048, lng: -38.5235 }, zoom: 15 },
  { id: 'tancredo-neves', label: 'Tancredo Neves', coords: { lat: -12.9786, lng: -38.4585 }, zoom: 15 },
  { id: 'cidade-baixa', label: 'Cidade Baixa', coords: { lat: -12.972, lng: -38.513 }, zoom: 15.2 },
  { id: 'aeroporto', label: 'Aeroporto', coords: { lat: -12.9125, lng: -38.3482 }, zoom: 14.5 },
];

export interface DesertZone {
  id: string;
  name: string;
  coords: Coordinates;
  radiusKm: number;
  description: string;
}

/** Populous regions with little or no public charging coverage. */
export const CHARGING_DESERTS: DesertZone[] = [
  {
    id: 'cajazeiras',
    name: 'Cajazeiras',
    coords: { lat: -12.905, lng: -38.405 },
    radiusKm: 3,
    description: 'Complexo habitacional de alta densidade sem eletropostos públicos.',
  },
  {
    id: 'suburbio-periperi',
    name: 'Subúrbio Ferroviário / Periperi',
    coords: { lat: -12.868, lng: -38.475 },
    radiusKm: 3.2,
    description: 'Orla da Baía de Todos-os-Santos sem cobertura de recarga.',
  },
  {
    id: 'cidade-baixa-ribeira',
    name: 'Cidade Baixa / Ribeira',
    coords: { lat: -12.912, lng: -38.495 },
    radiusKm: 2.6,
    description: 'Península de Itapagipe — tráfego intenso e nenhum ponto de recarga.',
  },
];

/** Neighborhoods that form the Orla / Tancredo Neves / Paralela corridor. */
export const CORRIDOR_NEIGHBORHOODS = [
  'Caminho das Árvores',
  'Itaigara',
  'Pituba',
  'Costa Azul',
  'STIEP',
  'Imbuí',
  'Alphaville I',
  'Trobogy',
  'Paralela',
  'Pituaçu',
  'Pituaçu / Patamares',
  'Jaguaribe / Piatã',
  'Piatã',
  'Itapuã',
  'Stella Maris',
  'São Cristóvão',
  'Aeroporto',
  'Iguatemi / ACM',
  'Horto Bela Vista',
  'Pernambués',
  'Rio Vermelho',
  'Barra',
];
