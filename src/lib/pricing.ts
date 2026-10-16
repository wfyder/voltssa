import type { Connector, ParkingRule, Station, Tariff, Vehicle } from '../types';
import { effectivePowerKw, isDc } from './compatibility';

/** AC/DC conversion + cable losses: the meter bills more than what reaches the battery. */
export const CHARGING_EFFICIENCY = 0.9;
/** DC chargers taper above this state of charge. */
export const DC_TAPER_SOC = 80;
export const DC_TAPER_FACTOR = 0.5;

export function tariffPriceAt(tariff: Tariff, hour: number): number {
  switch (tariff.kind) {
    case 'flat':
      return tariff.pricePerKwh;
    case 'tou':
      return hour >= tariff.peakStartHour && hour < tariff.peakEndHour ? tariff.peak : tariff.offPeak;
    case 'restricted':
      return 0;
  }
}

export const isPeakHour = (tariff: Tariff, hour: number): boolean =>
  tariff.kind === 'tou' && hour >= tariff.peakStartHour && hour < tariff.peakEndHour;

/**
 * Parking cost for a stay of `minutes`. Every started hour is billed (Brazilian
 * parking practice), so a 4h10 stay on a "4h block + R$1/h" rule costs block + 1h.
 */
export function parkingCost(rule: ParkingRule, minutes: number): number {
  if (minutes <= 0) return 0;
  switch (rule.kind) {
    case 'free':
    case 'unknown':
      return 0;
    case 'flat':
      return rule.price;
    case 'block': {
      const hours = minutes / 60;
      if (rule.extraPerHour === null) return Math.ceil(hours / rule.blockHours) * rule.price;
      if (hours <= rule.blockHours) return rule.price;
      return rule.price + Math.ceil(hours - rule.blockHours - 1e-9) * rule.extraPerHour;
    }
  }
}

export interface TariffBucket {
  label: string;
  pricePerKwh: number;
  kwh: number;
  cost: number;
  peak: boolean;
}

export interface ChargeEstimate {
  connector: Connector;
  effectivePowerKw: number;
  /** Energy stored in the battery. */
  energyToBatteryKwh: number;
  /** Energy billed by the meter (includes losses). */
  energyBilledKwh: number;
  durationMin: number;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
  buckets: TariffBucket[];
  energyCost: number;
  unlockFee: number;
  parkingCost: number;
  total: number;
  crossesPeak: boolean;
  restricted: boolean;
}

export interface ChargeInput {
  station: Station;
  vehicle: Vehicle;
  connector: Connector;
  currentPct: number;
  targetPct: number;
  startHour: number;
  startMinute?: number;
  powerSplit?: boolean;
}

/**
 * Minute-by-minute charging simulation.
 *
 *   Total = Σ(kWh billed in minute i × price at clock(i)) + unlock fee + parking(duration)
 *
 * Stepping per minute makes time-of-use tariffs exact when a session crosses the
 * peak boundary (e.g. Turbo Recarga: R$1,99 → R$2,99 at 16:00).
 */
export function estimateCharge(input: ChargeInput): ChargeEstimate {
  const { station, vehicle, connector, startHour } = input;
  const startMinute = input.startMinute ?? 0;
  const current = Math.max(0, Math.min(100, input.currentPct));
  const target = Math.max(current, Math.min(100, input.targetPct));
  const restricted = connector.tariff.kind === 'restricted';

  const ratedKw = effectivePowerKw(connector, vehicle, input.powerSplit);
  // Incompatible vehicle: fall back to connector rating so the UI can still show an estimate.
  const powerKw = ratedKw > 0 ? ratedKw : connector.powerKw;
  const dc = isDc(connector.type);

  const startMinuteOfDay = startHour * 60 + startMinute;
  const buckets = new Map<string, TariffBucket>();
  let soc = current;
  let toBattery = 0;
  let minutes = 0;
  const kwhPerPct = vehicle.batteryKwh / 100;

  while (soc < target - 1e-9 && minutes < 72 * 60) {
    const stepKw = dc && soc >= DC_TAPER_SOC ? powerKw * DC_TAPER_FACTOR : powerKw;
    const remainingKwh = (target - soc) * kwhPerPct;
    const delivered = Math.min(stepKw / 60, remainingKwh);
    const fraction = delivered / (stepKw / 60);

    const hour = Math.floor(((startMinuteOfDay + minutes) % 1440) / 60);
    const price = tariffPriceAt(connector.tariff, hour);
    const peak = isPeakHour(connector.tariff, hour);
    const key = `${price}-${peak}`;
    const billed = delivered / CHARGING_EFFICIENCY;
    const bucket = buckets.get(key) ?? {
      label: connector.tariff.kind === 'tou' ? (peak ? 'Horário de Ponta' : 'Fora de Ponta') : 'Energia',
      pricePerKwh: price,
      kwh: 0,
      cost: 0,
      peak,
    };
    bucket.kwh += billed;
    bucket.cost += billed * price;
    buckets.set(key, bucket);

    toBattery += delivered;
    soc += delivered / kwhPerPct;
    minutes += fraction;
  }

  const bucketList = [...buckets.values()];
  const energyCost = bucketList.reduce((sum, b) => sum + b.cost, 0);
  const durationMin = minutes;
  const parking = parkingCost(station.parking, durationMin);
  const unlockFee = durationMin > 0 ? station.unlockFee : 0;

  return {
    connector,
    effectivePowerKw: powerKw,
    energyToBatteryKwh: toBattery,
    energyBilledKwh: toBattery / CHARGING_EFFICIENCY,
    durationMin,
    startMinuteOfDay,
    endMinuteOfDay: startMinuteOfDay + durationMin,
    buckets: bucketList,
    energyCost,
    unlockFee,
    parkingCost: parking,
    total: energyCost + unlockFee + parking,
    crossesPeak: bucketList.some((b) => b.peak) && bucketList.some((b) => !b.peak),
    restricted,
  };
}
