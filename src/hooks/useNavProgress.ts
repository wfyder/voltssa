import { useMemo } from 'react';
import { STATION_BY_ID, VEHICLE_BY_ID } from '../data/salvadorStations';
import { computeProgress, type NavProgress } from '../lib/navigation';
import { useAppStore } from '../store/useAppStore';

export interface NavView extends NavProgress {
  /** Battery estimate right now, consuming the relief-adjusted energy as the car advances. */
  batteryNowPct: number;
  batteryArrivalPct: number;
  /** Simulated clock (simulated hour + real minutes) at arrival, in minutes of the day. */
  etaMinuteOfDay: number;
  /** True when the car would arrive after the station closes. */
  arrivesAfterClose: boolean;
}

/** Live navigation numbers derived from the route and the current car position. */
export function useNavProgress(): NavView | null {
  const navigation = useAppStore((s) => s.navigation);
  const routeState = useAppStore((s) => s.routeState);
  const vehicleId = useAppStore((s) => s.vehicleId);
  const simHour = useAppStore((s) => s.simHour);

  return useMemo(() => {
    if (!navigation || routeState.status !== 'ready') return null;
    const { route } = routeState;
    const progress = computeProgress(route.geometry, route.steps, route.durationMin, navigation.position);
    const vehicle = VEHICLE_BY_ID[vehicleId];
    const usedPct = (route.energy.realKwh / vehicle.batteryKwh) * 100;
    const batteryNowPct = navigation.routeStartBatteryPct - usedPct * progress.progress;
    const nowMinute = simHour * 60 + new Date().getMinutes();
    const etaMinuteOfDay = nowMinute + progress.remainingMin;
    const hours = STATION_BY_ID[navigation.stationId].hours;
    return {
      ...progress,
      batteryNowPct: Math.max(0, batteryNowPct),
      batteryArrivalPct: navigation.routeStartBatteryPct - usedPct,
      etaMinuteOfDay,
      arrivesAfterClose: hours !== null && etaMinuteOfDay >= hours.close * 60,
    };
  }, [navigation, routeState, vehicleId, simHour]);
}
