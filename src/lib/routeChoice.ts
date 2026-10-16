import type { Vehicle } from '../types';
import type { TopographyEnergy } from './energy';

/** Battery the driver should still have when reaching the charger. */
export const ARRIVAL_RESERVE_PCT = 5;
/** Below this charge the planner trades more time for less energy. */
export const LOW_BATTERY_PCT = 25;
/** How much slower than the fastest option an energy-saving route may be. */
export const TIME_BUDGET = 1.2;
export const TIME_BUDGET_LOW_BATTERY = 1.5;

export interface RouteCandidate {
  durationMin: number;
  distanceKm: number;
  energy: TopographyEnergy;
}

export interface RouteEvaluation {
  energyKwh: number;
  arrivalPct: number;
  reachable: boolean;
  /** Extra time vs. the fastest option, in percent. */
  extraTimePct: number;
}

export interface RouteDecision {
  index: number;
  reason: string;
  reachable: boolean;
  evaluations: RouteEvaluation[];
}

export function evaluateRoutes(candidates: RouteCandidate[], vehicle: Vehicle, batteryPct: number): RouteEvaluation[] {
  const fastest = Math.min(...candidates.map((c) => c.durationMin));
  return candidates.map((c) => {
    const arrivalPct = batteryPct - (c.energy.realKwh / vehicle.batteryKwh) * 100;
    return {
      energyKwh: c.energy.realKwh,
      arrivalPct,
      reachable: arrivalPct >= ARRIVAL_RESERVE_PCT,
      extraTimePct: fastest > 0 ? ((c.durationMin - fastest) / fastest) * 100 : 0,
    };
  });
}

const fmtKwh = (v: number) => `${v.toFixed(2).replace('.', ',')} kWh`;

/**
 * Chooses among routing alternatives using relief, battery and vehicle:
 *  1. only routes that arrive with ≥ ARRIVAL_RESERVE_PCT battery are eligible;
 *  2. among those not much slower than the fastest (20%, or 50% when the battery is low),
 *     take the one that spends the least energy (climbs cost mass × height, descents regenerate);
 *  3. if nothing is reachable, pick the least-energy route and flag it.
 */
export function chooseRoute(candidates: RouteCandidate[], vehicle: Vehicle, batteryPct: number): RouteDecision {
  if (candidates.length === 0) throw new Error('No route candidates');
  const evaluations = evaluateRoutes(candidates, vehicle, batteryPct);
  const budget = batteryPct < LOW_BATTERY_PCT ? TIME_BUDGET_LOW_BATTERY : TIME_BUDGET;
  const fastestIdx = candidates.reduce((best, c, i) => (c.durationMin < candidates[best].durationMin ? i : best), 0);
  const fastest = candidates[fastestIdx].durationMin;
  const byEnergy = (pool: number[]) => pool.reduce((best, i) => (evaluations[i].energyKwh < evaluations[best].energyKwh ? i : best));

  const all = candidates.map((_, i) => i);
  const reachable = all.filter((i) => evaluations[i].reachable);
  const inBudget = reachable.filter((i) => candidates[i].durationMin <= fastest * budget);

  if (inBudget.length > 0) {
    const index = byEnergy(inBudget);
    if (index === fastestIdx) {
      return {
        index,
        reachable: true,
        evaluations,
        reason:
          candidates.length > 1
            ? 'A rota mais rápida também é a que gasta menos bateria com o relevo.'
            : 'Única rota encontrada; chega com bateria suficiente.',
      };
    }
    const saved = evaluations[fastestIdx].energyKwh - evaluations[index].energyKwh;
    const extraMin = candidates[index].durationMin - fastest;
    return {
      index,
      reachable: true,
      evaluations,
      reason: `Economiza ${fmtKwh(saved)} evitando subidas${
        batteryPct < LOW_BATTERY_PCT ? ' (bateria baixa)' : ''
      }, com ${Math.max(1, Math.round(extraMin))} min a mais que a mais rápida.`,
    };
  }

  if (reachable.length > 0) {
    return {
      index: byEnergy(reachable),
      reachable: true,
      evaluations,
      reason: 'As rotas mais rápidas não chegam com a bateria atual; esta é a única que chega.',
    };
  }

  return {
    index: byEnergy(all),
    reachable: false,
    evaluations,
    reason: 'Nenhuma rota chega com a bateria atual. Mostrando a que gasta menos energia.',
  };
}
