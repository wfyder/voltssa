import type { Vehicle } from '../types';

const G = 9.81;
const J_PER_KWH = 3_600_000;
/** Motor + inverter efficiency when climbing. */
export const DRIVETRAIN_EFFICIENCY = 0.88;

export interface ProfilePoint {
  distanceKm: number;
  elevationM: number;
}

export interface TopographyEnergy {
  distanceKm: number;
  flatKwh: number;
  climbKwh: number;
  regenKwh: number;
  realKwh: number;
  deltaPct: number;
  ascentM: number;
  descentM: number;
  maxGradePct: number;
  minElevationM: number;
  maxElevationM: number;
}

/**
 * Consumption adjusted by relief:
 *   E_real = E_flat + Σ m·g·Δh⁺ / η_drive − Σ m·g·Δh⁻ · η_regen(vehicle)
 */
export function computeTopographyEnergy(vehicle: Vehicle, profile: ProfilePoint[]): TopographyEnergy {
  const distanceKm = profile.length > 0 ? profile[profile.length - 1].distanceKm : 0;
  const flatKwh = distanceKm * vehicle.consumptionKwhPerKm;
  let ascentM = 0;
  let descentM = 0;
  let maxGradePct = 0;

  for (let i = 1; i < profile.length; i++) {
    const dh = profile[i].elevationM - profile[i - 1].elevationM;
    const dxM = (profile[i].distanceKm - profile[i - 1].distanceKm) * 1000;
    if (dh > 0) ascentM += dh;
    else descentM += -dh;
    if (dxM > 20) maxGradePct = Math.max(maxGradePct, (Math.abs(dh) / dxM) * 100);
  }

  const climbKwh = (vehicle.massKg * G * ascentM) / J_PER_KWH / DRIVETRAIN_EFFICIENCY;
  const regenKwh = ((vehicle.massKg * G * descentM) / J_PER_KWH) * vehicle.regenEfficiency;
  const realKwh = Math.max(0, flatKwh + climbKwh - regenKwh);
  const elevations = profile.map((p) => p.elevationM);

  return {
    distanceKm,
    flatKwh,
    climbKwh,
    regenKwh,
    realKwh,
    deltaPct: flatKwh > 0 ? ((realKwh - flatKwh) / flatKwh) * 100 : 0,
    ascentM,
    descentM,
    maxGradePct,
    minElevationM: elevations.length ? Math.min(...elevations) : 0,
    maxElevationM: elevations.length ? Math.max(...elevations) : 0,
  };
}
