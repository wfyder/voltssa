import type { Station } from '../types';
import { hasDcFast, isFree } from './compatibility';

export type CarFilter = 'near' | 'fast' | 'free';

export const CAR_FILTER_LABEL: Record<CarFilter, string> = {
  near: 'Próximos',
  fast: 'Rápidos DC',
  free: 'Grátis',
};

/** Max rows on a car screen — CarPlay list templates also cap visible items. */
export const CAR_LIST_LIMIT = 6;

interface Rankable {
  station: Station;
  block: unknown;
  distanceM: number;
}

/**
 * Stations offered while driving: only ones the driver can actually use right now
 * (compatible, open, working, not restricted), nearest first.
 */
export function rankCarStations<T extends Rankable>(views: T[], filter: CarFilter, limit = CAR_LIST_LIMIT): T[] {
  return views
    .filter((v) => v.block === null)
    .filter((v) => (filter === 'fast' ? hasDcFast(v.station) : filter === 'free' ? isFree(v.station) : true))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}
