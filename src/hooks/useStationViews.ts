import { useMemo } from 'react';
import { SALVADOR_CENTER } from '../data/cityZones';
import { VEHICLE_BY_ID } from '../data/salvadorStations';
import {
  bestConnector,
  hasAcCharging,
  hasDcFast,
  hasPlug,
  isCompatible,
  isFree,
} from '../lib/compatibility';
import { distanceMeters } from '../lib/geo';
import { isOpenAt } from '../lib/hours';
import { estimateCharge, type ChargeEstimate } from '../lib/pricing';
import { blockReason, displayStatus, useAppStore, type BlockReason, type Filters } from '../store/useAppStore';
import type { Station, StationRuntime, StationStatus } from '../types';

export interface StationView {
  station: Station;
  runtime: StationRuntime;
  status: StationStatus;
  compatible: boolean;
  open: boolean;
  distanceM: number;
  estimate: ChargeEstimate;
  block: BlockReason;
}

export const DEFAULT_TARGET_PCT = 80;

function matchesFilters(view: StationView, filters: Filters): boolean {
  const { station } = view;
  const q = filters.search.trim().toLowerCase();
  if (q && !`${station.name} ${station.neighborhood} ${station.address}`.toLowerCase().includes(q)) return false;
  if (filters.type2 && !hasPlug(station, 'TYPE2_AC')) return false;
  if (filters.ccs2 && !hasPlug(station, 'CCS2_DC')) return false;
  if (filters.free && !isFree(station)) return false;
  if (filters.dcFast && !hasDcFast(station)) return false;
  if (filters.acSlow && !hasAcCharging(station)) return false;
  if (filters.openNow && !view.open) return false;
  if (filters.compatibleOnly && !view.compatible) return false;
  return true;
}

/** All stations enriched with the live context (vehicle, battery, simulated hour, location). */
export function useStationViews(): { all: StationView[]; visible: StationView[] } {
  const vehicleId = useAppStore((s) => s.vehicleId);
  const batteryPct = useAppStore((s) => s.batteryPct);
  const simHour = useAppStore((s) => s.simHour);
  const runtime = useAppStore((s) => s.runtime);
  const userLocation = useAppStore((s) => s.userLocation);
  const filters = useAppStore((s) => s.filters);
  const sortBy = useAppStore((s) => s.sortBy);
  const stations = useAppStore((s) => s.stations);

  const all = useMemo(() => {
    const vehicle = VEHICLE_BY_ID[vehicleId];
    const origin = userLocation ?? SALVADOR_CENTER;
    const target = Math.max(DEFAULT_TARGET_PCT, Math.min(100, batteryPct + 20));
    return stations.map((station): StationView => {
      const rt = runtime[station.id];
      const connector = bestConnector(station, vehicle, rt.powerSplit);
      return {
        station,
        runtime: rt,
        status: displayStatus(rt),
        compatible: isCompatible(station, vehicle),
        open: isOpenAt(station.hours, simHour),
        distanceM: distanceMeters(origin, station.coords),
        estimate: estimateCharge({
          station,
          vehicle,
          connector,
          currentPct: batteryPct,
          targetPct: target,
          startHour: simHour,
          powerSplit: rt.powerSplit,
        }),
        block: blockReason(station, rt, vehicleId, simHour),
      };
    });
  }, [stations, vehicleId, batteryPct, simHour, runtime, userLocation]);

  const visible = useMemo(() => {
    const list = all.filter((v) => matchesFilters(v, filters));
    const sorters: Record<typeof sortBy, (a: StationView, b: StationView) => number> = {
      distance: (a, b) => a.distanceM - b.distanceM,
      cost: (a, b) => a.estimate.total - b.estimate.total || a.distanceM - b.distanceM,
      reliability: (a, b) => b.runtime.reliability - a.runtime.reliability,
    };
    // Blocked stations always sink to the bottom of the list.
    return list.sort((a, b) => Number(a.block !== null) - Number(b.block !== null) || sorters[sortBy](a, b));
  }, [all, filters, sortBy]);

  return { all, visible };
}
