import type { Connector, PlugType, Station, Vehicle } from '../types';

export const PLUG_LABEL: Record<PlugType, string> = {
  TYPE2_AC: 'Tipo 2 (AC)',
  CCS2_DC: 'CCS2 (DC)',
  CHADEMO_DC: 'CHAdeMO (DC)',
};

export const AC_MAX_KW = 22;
export const DC_FAST_MIN_KW = 30;

export const isDc = (type: PlugType): boolean => type !== 'TYPE2_AC';

/** Max power the vehicle accepts on a given connector. */
export function vehicleLimitKw(vehicle: Vehicle, type: PlugType): number {
  if (!vehicle.plugs.includes(type)) return 0;
  return isDc(type) ? vehicle.maxDcKw : vehicle.maxAcKw;
}

/**
 * Effective power = min(connector rating, vehicle onboard limit).
 * When two cars share one DC cabinet (`powerSplit`), the cabinet power is halved.
 */
export function effectivePowerKw(connector: Connector, vehicle: Vehicle, powerSplit = false): number {
  const stationKw = powerSplit && isDc(connector.type) ? connector.powerKw / 2 : connector.powerKw;
  return Math.min(stationKw, vehicleLimitKw(vehicle, connector.type));
}

export function usableConnectors(station: Station, vehicle: Vehicle): Connector[] {
  return station.connectors.filter((c) => vehicleLimitKw(vehicle, c.type) > 0);
}

export function isCompatible(station: Station, vehicle: Vehicle): boolean {
  return usableConnectors(station, vehicle).length > 0;
}

/** Fastest connector this vehicle can use, or the station's fastest one if none is compatible. */
export function bestConnector(station: Station, vehicle: Vehicle, powerSplit = false): Connector {
  const usable = usableConnectors(station, vehicle);
  const pool = usable.length > 0 ? usable : station.connectors;
  return pool.reduce((best, c) =>
    effectivePowerKw(c, vehicle, powerSplit) > effectivePowerKw(best, vehicle, powerSplit) ? c : best,
  );
}

export const hasPlug = (station: Station, type: PlugType): boolean => station.connectors.some((c) => c.type === type);

export const hasDcFast = (station: Station): boolean =>
  station.connectors.some((c) => isDc(c.type) && c.powerKw >= DC_FAST_MIN_KW);

export const hasAcCharging = (station: Station): boolean =>
  station.connectors.some((c) => c.type === 'TYPE2_AC' && c.powerKw <= AC_MAX_KW);

export const isRestricted = (station: Station): boolean => station.connectors.every((c) => c.tariff.kind === 'restricted');

export const isFree = (station: Station): boolean =>
  station.connectors.every((c) => c.tariff.kind === 'flat' && c.tariff.pricePerKwh === 0);

export const maxPowerKw = (station: Station): number => Math.max(...station.connectors.map((c) => c.powerKw));
