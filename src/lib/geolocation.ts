import { SALVADOR_CENTER, isInsideSalvador } from '../data/cityZones';
import type { Coordinates } from '../types';
import { distanceMeters } from './geo';

/** Beyond this distance from the city centre the user is clearly not driving in Salvador. */
export const METRO_RADIUS_KM = 45;

export type LocateErrorCode = 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'unsupported';

export const LOCATE_MESSAGE: Record<LocateErrorCode, string> = {
  denied: 'Permissão de localização negada. Libere a localização nas configurações do navegador ou toque no mapa.',
  unavailable: 'Não foi possível obter sua posição agora. Verifique se o GPS está ligado.',
  timeout: 'O GPS demorou demais para responder. Tente de novo em um lugar aberto.',
  insecure: 'A localização só funciona em HTTPS (ou localhost). Abra o app por um endereço seguro.',
  unsupported: 'Este navegador não oferece geolocalização.',
};

export class LocateError extends Error {
  constructor(public readonly code: LocateErrorCode) {
    super(LOCATE_MESSAGE[code]);
  }
}

export interface GpsFix {
  coords: Coordinates;
  accuracyM: number;
  heading: number | null;
}

export function geolocationSupport(): 'ok' | 'insecure' | 'unsupported' {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return 'ok';
}

export function errorCodeFrom(err: GeolocationPositionError): LocateErrorCode {
  if (err.code === err.PERMISSION_DENIED) return 'denied';
  if (err.code === err.TIMEOUT) return 'timeout';
  return 'unavailable';
}

/** One high-accuracy fix from the device GPS. */
export function getCurrentFix(timeoutMs = 12000): Promise<GpsFix> {
  const support = geolocationSupport();
  if (support !== 'ok') return Promise.reject(new LocateError(support));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracyM: pos.coords.accuracy,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        }),
      (err) => reject(new LocateError(errorCodeFrom(err))),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    );
  });
}

export type Proximity = 'inside' | 'metro' | 'far';

/** Is the driver in Salvador, in the metropolitan area, or somewhere else entirely? */
export function salvadorProximity(c: Coordinates): { proximity: Proximity; distanceKm: number } {
  const distanceKm = distanceMeters(c, SALVADOR_CENTER) / 1000;
  if (isInsideSalvador(c)) return { proximity: 'inside', distanceKm };
  return { proximity: distanceKm <= METRO_RADIUS_KM ? 'metro' : 'far', distanceKm };
}
