import type { OpeningHours } from '../types';
import { formatHour } from './utils';

/** QA rule: a station is open when `open <= hour < close`. `null` = 24h. */
export function isOpenAt(hours: OpeningHours | null, hour: number): boolean {
  if (hours === null) return true;
  return hour >= hours.open && hour < hours.close;
}

/** Minutes left until closing, counted from the top of `hour`. Infinity for 24h stations. */
export function minutesUntilClose(hours: OpeningHours | null, hour: number, minute = 0): number {
  if (hours === null) return Number.POSITIVE_INFINITY;
  if (!isOpenAt(hours, hour)) return 0;
  return (hours.close - hour) * 60 - minute;
}

export function describeHours(hours: OpeningHours | null, hour: number): string {
  if (hours === null) return 'Aberto 24h';
  if (isOpenAt(hours, hour)) return `Aberto · fecha às ${formatHour(hours.close)}`;
  return hour < hours.open ? `Fechado · abre às ${formatHour(hours.open)}` : `Fechado desde ${formatHour(hours.close)}`;
}
