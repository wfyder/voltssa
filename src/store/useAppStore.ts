import { create } from 'zustand';
import {
  registerStation,
  SALVADOR_STATIONS,
  STATION_BY_ID,
  unregisterStation,
  VEHICLE_BY_ID,
  VEHICLES,
} from '../data/salvadorStations';
import { isCompatible, isRestricted } from '../lib/compatibility';
import { resolveOfficialStatus, validateReport } from '../lib/crowd';
import { offsetCoords } from '../lib/geo';
import { getCurrentFix, LocateError, LOCATE_MESSAGE, salvadorProximity } from '../lib/geolocation';
import { computeProgress, pointAlong } from '../lib/navigation';
import { isOpenAt } from '../lib/hours';
import { ReservationEngine } from '../lib/reservationEngine';
import type { SelfTestResult } from '../lib/qaSelfTest';
import { buildSmartRoute, withOption, type SmartRoute } from '../lib/routing';
import {
  loadUserStations,
  newStationId,
  saveUserStations,
  stationFromDraft,
  validateDraft,
  type DraftValidation,
  type StationDraft,
} from '../lib/stationDraft';
import { clamp, formatDistance, formatHour, uid } from '../lib/utils';
import type {
  ChargingSession,
  Coordinates,
  CrowdReport,
  QaEvent,
  QaSeverity,
  Station,
  StationRuntime,
  StationStatus,
} from '../types';

export type ViewMode = 'driver' | 'smartcity';
export type SortKey = 'distance' | 'cost' | 'reliability';
export type DrawerTab = 'overview' | 'cost' | 'queue' | 'route' | 'indoor';

export interface Filters {
  search: string;
  type2: boolean;
  ccs2: boolean;
  free: boolean;
  dcFast: boolean;
  acSlow: boolean;
  openNow: boolean;
  compatibleOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  type2: false,
  ccs2: false,
  free: false,
  dcFast: false,
  acSlow: false,
  openNow: false,
  compatibleOnly: false,
};

export const CURRENT_USER_ID = 'voce';

export interface FraudAlert {
  stationId: string;
  distanceM: number | null;
  message: string;
}

export type BlockReason = 'closed' | 'incompatible' | 'maintenance' | 'restricted' | 'ocpp' | null;

export interface StationFormState {
  open: boolean;
  /** null = creating a new station. */
  editingId: string | null;
  /** Waiting for a map click to place the station. */
  picking: boolean;
  coords: Coordinates | null;
}

const CLOSED_FORM: StationFormState = { open: false, editingId: null, picking: false, coords: null };

export type NavMode = 'simulated' | 'gps';

export interface NavigationState {
  stationId: string;
  mode: NavMode;
  paused: boolean;
  /** Simulation speed multiplier (1 = real time). */
  speed: number;
  /** Simulated distance driven along the current route geometry (km). */
  simKm: number;
  /** Lat/lng delta applied to the simulated car — used to fake a wrong turn. */
  simOffset: Coordinates | null;
  position: Coordinates;
  heading: number;
  follow: boolean;
  voice: boolean;
  rerouting: boolean;
  arrived: boolean;
  gpsError: string | null;
  /** Battery when the current route started (reset on every reroute). */
  routeStartBatteryPct: number;
  reroutes: number;
}

export type RouteState =
  | { status: 'idle' }
  | { status: 'loading'; stationId: string }
  | { status: 'ready'; stationId: string; route: SmartRoute }
  | { status: 'error'; stationId: string; message: string };

interface AppState {
  vehicleId: string;
  batteryPct: number;
  simHour: number;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  filters: Filters;
  sortBy: SortKey;
  runtime: Record<string, StationRuntime>;
  selectedStationId: string | null;
  drawerTab: DrawerTab;
  userLocation: Coordinates | null;
  pickingLocation: boolean;
  /** Where the current location came from: device GPS or a click on the map. */
  locationSource: 'gps' | 'manual' | null;
  locationAccuracyM: number | null;
  locationStatus: 'idle' | 'locating' | 'ok' | 'error';
  locationNotice: string | null;
  /** CarPlay-style large-touch layout. */
  carMode: boolean;
  routeState: RouteState;
  qaLog: QaEvent[];
  fraudAlert: FraudAlert | null;
  qaPanelOpen: boolean;
  nightMap: boolean;
  simulatedReporters: number;
  selfTests: SelfTestResult[] | null;

  setSelfTests: (results: SelfTestResult[]) => void;
  setVehicle: (id: string) => void;
  setBattery: (pct: number) => void;
  setSimHour: (hour: number) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;
  setSortBy: (key: SortKey) => void;
  selectStation: (id: string | null, tab?: DrawerTab) => void;
  setDrawerTab: (tab: DrawerTab) => void;
  setPickingLocation: (value: boolean) => void;
  setUserLocation: (coords: Coordinates | null, source?: 'gps' | 'manual', accuracyM?: number | null) => void;
  locateMe: () => Promise<boolean>;
  dismissLocationNotice: () => void;
  setCarMode: (on: boolean) => void;
  /** One tap: locate if needed, trace the route and start turn-by-turn navigation. */
  quickNavigate: (stationId: string) => Promise<void>;
  simulatePresenceAt: (stationId: string) => void;
  setQaPanelOpen: (open: boolean) => void;
  setNightMap: (value: boolean) => void;
  dismissFraudAlert: () => void;

  logQa: (category: QaEvent['category'], severity: QaSeverity, message: string, stationId?: string) => void;
  clearQaLog: () => void;

  submitReport: (stationId: string, status: StationStatus, method: 'report' | 'checkin') => boolean;
  simulateOtherDriverReport: (stationId: string, status: StationStatus) => void;

  reserveSlot: (stationId: string) => Promise<'confirmed' | 'queued' | 'blocked'>;
  cancelReservation: (stationId: string, reservationId: string) => void;

  toggleOcpp: (stationId: string) => void;
  dropRandomOcpp: (count: number) => string[];
  restoreAllOcpp: () => void;
  togglePowerSplit: (stationId: string) => void;

  traceRoute: (stationId: string) => Promise<void>;
  /** Switch the active route to another planned alternative. */
  selectRouteOption: (index: number) => void;
  clearRoute: () => void;

  /** Curated survey + stations added by the user. */
  stations: Station[];
  stationForm: StationFormState;
  openStationForm: (editingId?: string | null) => void;
  closeStationForm: () => void;
  setStationFormPicking: (picking: boolean) => void;
  setStationFormCoords: (coords: Coordinates | null) => void;
  saveStationDraft: (draft: StationDraft) => { ok: true; id: string } | { ok: false; validation: DraftValidation };
  removeStation: (id: string) => void;

  navigation: NavigationState | null;
  startNavigation: (mode: NavMode) => void;
  stopNavigation: (openTab?: DrawerTab) => void;
  setNavPaused: (paused: boolean) => void;
  setNavSpeed: (speed: number) => void;
  setNavFollow: (follow: boolean) => void;
  setNavVoice: (voice: boolean) => void;
  advanceSimulation: (dtSec: number) => void;
  updateGpsPosition: (coords: Coordinates, heading: number | null) => void;
  setGpsError: (message: string | null) => void;
  simulateDetour: () => void;
  reroute: () => Promise<void>;
  markArrived: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Deterministic seed for live occupancy                                     */
/* -------------------------------------------------------------------------- */

function seeded(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function seedRuntime(station: Station): StationRuntime {
  const status = station.initialStatus;
  let occupied = 0;
  if (station.source === 'user') occupied = 0;
  else if (status === 'busy') occupied = station.slots;
  else if (status === 'available') occupied = Math.min(station.slots - 1, Math.floor(seeded(station.index) * station.slots));
  const sessions: ChargingSession[] = Array.from({ length: occupied }, (_, i) => ({
    id: `seed-${station.id}-${i}`,
    driver: `EV-${String(1000 + Math.floor(seeded(station.index * 7 + i) * 8999))}`,
    remainingMin: 8 + Math.floor(seeded(station.index * 13 + i) * 85),
  }));
  return {
    status,
    reliability: station.baseReliability,
    sessions,
    reservations: [],
    reports: [],
    ocppOnline: true,
    powerSplit: false,
  };
}

// Stations added by the user in earlier sessions (localStorage).
const initialUserStations = loadUserStations();
initialUserStations.forEach(registerStation);

const initialRuntime = (): Record<string, StationRuntime> =>
  Object.fromEntries([...SALVADOR_STATIONS, ...initialUserStations].map((s) => [s.id, seedRuntime(s)]));

/* -------------------------------------------------------------------------- */
/*  Derived helpers (pure)                                                    */
/* -------------------------------------------------------------------------- */

export function displayStatus(rt: StationRuntime): StationStatus {
  return rt.ocppOnline ? rt.status : 'maintenance';
}

export function occupiedSlots(rt: StationRuntime): number {
  return rt.sessions.length + rt.reservations.filter((r) => r.kind === 'slot').length;
}

export function blockReason(station: Station, rt: StationRuntime, vehicleId: string, hour: number): BlockReason {
  if (!rt.ocppOnline) return 'ocpp';
  if (rt.status === 'maintenance') return 'maintenance';
  if (isRestricted(station)) return 'restricted';
  if (!isCompatible(station, VEHICLE_BY_ID[vehicleId])) return 'incompatible';
  if (!isOpenAt(station.hours, hour)) return 'closed';
  return null;
}

export const BLOCK_REASON_LABEL: Record<Exclude<BlockReason, null>, string> = {
  ocpp: 'Comunicação OCPP perdida',
  maintenance: 'Em manutenção',
  restricted: 'Acesso restrito',
  incompatible: 'Veículo incompatível',
  closed: 'Fechado neste horário',
};

/** Estimated wait (minutes) for the n-th car in the virtual queue (0-based). */
export function estimatedWaitMin(rt: StationRuntime, slots: number, position: number): number {
  const remaining = rt.sessions.map((s) => s.remainingMin).sort((a, b) => a - b);
  if (remaining.length < slots) return 0;
  const AVG_SESSION_MIN = 55;
  const lane = position % remaining.length;
  return remaining[lane] + Math.floor(position / remaining.length) * AVG_SESSION_MIN;
}

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

const engines = new Map<string, ReservationEngine>();
let routeAbort: AbortController | null = null;

export const useAppStore = create<AppState>()((set, get) => {
  const patchRuntime = (stationId: string, patch: (rt: StationRuntime) => StationRuntime) =>
    set((s) => ({ runtime: { ...s.runtime, [stationId]: patch(s.runtime[stationId]) } }));

  const engineFor = (stationId: string): ReservationEngine => {
    let engine = engines.get(stationId);
    if (!engine) {
      engine = new ReservationEngine({
        read: () => ({ capacity: STATION_BY_ID[stationId].slots, taken: occupiedSlots(get().runtime[stationId]) }),
        commit: (driver) =>
          patchRuntime(stationId, (rt) => ({
            ...rt,
            reservations: [...rt.reservations, { id: uid('res'), driver, createdAt: Date.now(), kind: 'slot' }],
          })),
      });
      engines.set(stationId, engine);
    }
    return engine;
  };

  const syncOccupancyStatus = (stationId: string) =>
    patchRuntime(stationId, (rt) => {
      if (rt.status === 'maintenance') return rt;
      const full = occupiedSlots(rt) >= STATION_BY_ID[stationId].slots;
      return { ...rt, status: full ? 'busy' : 'available' };
    });

  return {
    vehicleId: VEHICLES[0].id,
    batteryPct: 35,
    simHour: new Date().getHours(),
    viewMode: 'driver',
    sidebarOpen: true,
    filters: EMPTY_FILTERS,
    sortBy: 'distance',
    runtime: initialRuntime(),
    selectedStationId: null,
    drawerTab: 'overview',
    userLocation: null,
    pickingLocation: false,
    routeState: { status: 'idle' },
    qaLog: [],
    fraudAlert: null,
    qaPanelOpen: false,
    locationSource: null,
    locationAccuracyM: null,
    locationStatus: 'idle',
    locationNotice: null,
    carMode: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modo') === 'carro',
    nightMap: true,
    simulatedReporters: 0,
    selfTests: null,

    setSelfTests: (results) => set({ selfTests: results }),
    setVehicle: (id) => {
      set({ vehicleId: id });
      get().logQa('rule', 'info', `Veículo alterado para ${VEHICLE_BY_ID[id].name}`);
    },
    setBattery: (pct) => set({ batteryPct: clamp(Math.round(pct), 5, 100) }),
    setSimHour: (hour) => set({ simHour: clamp(Math.round(hour), 0, 23) }),
    setViewMode: (mode) => set({ viewMode: mode }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
    resetFilters: () => set({ filters: EMPTY_FILTERS }),
    setSortBy: (key) => set({ sortBy: key }),
    selectStation: (id, tab = 'overview') => set({ selectedStationId: id, drawerTab: tab }),
    setDrawerTab: (tab) => set({ drawerTab: tab }),
    setPickingLocation: (value) => set({ pickingLocation: value }),
    setUserLocation: (coords, source = 'manual', accuracyM = null) => {
      set({
        userLocation: coords,
        pickingLocation: false,
        locationSource: coords ? source : null,
        locationAccuracyM: coords ? accuracyM : null,
      });
      const rs = get().routeState;
      if (rs.status !== 'idle') get().clearRoute();
    },

    locateMe: async () => {
      set({ locationStatus: 'locating', locationNotice: null, pickingLocation: false });
      try {
        const fix = await getCurrentFix();
        get().setUserLocation(fix.coords, 'gps', fix.accuracyM);
        const { proximity, distanceKm } = salvadorProximity(fix.coords);
        set({
          locationStatus: 'ok',
          locationNotice:
            proximity === 'far'
              ? `Você está a ${Math.round(distanceKm)} km de Salvador. Os postos e rotas do app são da cidade.`
              : null,
        });
        get().logQa('route', 'info', `Localização obtida pelo GPS (precisão de ${Math.round(fix.accuracyM)} m, ${proximity})`);
        return true;
      } catch (err) {
        const message = err instanceof LocateError ? err.message : LOCATE_MESSAGE.unavailable;
        set({ locationStatus: 'error', locationNotice: message });
        get().logQa('route', 'warn', `Falha ao obter localização: ${message}`);
        return false;
      }
    },

    dismissLocationNotice: () => set({ locationNotice: null }),

    setCarMode: (on) => {
      set({ carMode: on, selectedStationId: null, qaPanelOpen: false, viewMode: 'driver' });
      try {
        const url = new URL(window.location.href);
        if (on) url.searchParams.set('modo', 'carro');
        else url.searchParams.delete('modo');
        window.history.replaceState(null, '', url);
      } catch {
        /* history unavailable */
      }
    },

    quickNavigate: async (stationId) => {
      if (!get().userLocation && !(await get().locateMe())) return;
      await get().traceRoute(stationId);
      if (get().routeState.status !== 'ready') return;
      get().startNavigation(get().locationSource === 'gps' ? 'gps' : 'simulated');
    },
    simulatePresenceAt: (stationId) => {
      const station = STATION_BY_ID[stationId];
      get().setUserLocation(offsetCoords(station.coords, 35, 120));
      get().logQa('crowd', 'info', `Presença simulada a 35 m de ${station.name}`, stationId);
    },
    setQaPanelOpen: (open) => set({ qaPanelOpen: open }),
    setNightMap: (value) => set({ nightMap: value }),
    dismissFraudAlert: () => set({ fraudAlert: null }),

    logQa: (category, severity, message, stationId) =>
      set((s) => ({
        qaLog: [{ id: uid('qa'), at: Date.now(), category, severity, message, stationId }, ...s.qaLog].slice(0, 400),
      })),
    clearQaLog: () => set({ qaLog: [] }),

    submitReport: (stationId, status, method) => {
      const station = STATION_BY_ID[stationId];
      const rt = get().runtime[stationId];
      const verdict = validateReport({
        status,
        method,
        reporterId: CURRENT_USER_ID,
        userLocation: get().userLocation,
        stationCoords: station.coords,
        existingReports: rt.reports,
      });

      if (!verdict.ok) {
        if (verdict.code === 'DUPLICATE') {
          get().logQa('crowd', 'warn', `Reporte duplicado bloqueado em ${station.name}`, stationId);
        } else {
          set({ fraudAlert: { stationId, distanceM: verdict.distanceM, message: verdict.message } });
          get().logQa(
            'fraud',
            'warn',
            `Fraude de geolocalização bloqueada em ${station.name} (${
              verdict.distanceM === null ? 'sem localização' : formatDistance(verdict.distanceM)
            })`,
            stationId,
          );
        }
        return false;
      }

      applyReport(stationId, {
        id: uid('rep'),
        reporterId: CURRENT_USER_ID,
        status,
        createdAt: Date.now(),
        distanceM: verdict.distanceM,
        method,
      });
      return true;
    },

    simulateOtherDriverReport: (stationId, status) => {
      const station = STATION_BY_ID[stationId];
      const n = get().simulatedReporters + 1;
      set({ simulatedReporters: n });
      const reporterLocation = offsetCoords(station.coords, 20 + (n % 5) * 10, n * 47);
      const reporterId = `motorista-${n}`;
      const verdict = validateReport({
        status,
        method: 'report',
        reporterId,
        userLocation: reporterLocation,
        stationCoords: station.coords,
        existingReports: get().runtime[stationId].reports,
      });
      if (!verdict.ok) return;
      applyReport(stationId, {
        id: uid('rep'),
        reporterId,
        status,
        createdAt: Date.now(),
        distanceM: verdict.distanceM,
        method: 'report',
      });
    },

    reserveSlot: async (stationId) => {
      const station = STATION_BY_ID[stationId];
      const { vehicleId, simHour } = get();
      const reason = blockReason(station, get().runtime[stationId], vehicleId, simHour);
      if (reason) {
        get().logQa('reservation', 'warn', `Reserva bloqueada em ${station.name}: ${BLOCK_REASON_LABEL[reason]}`, stationId);
        return 'blocked';
      }
      const outcome = await engineFor(stationId).reserve(CURRENT_USER_ID, { useLock: true, latencyMs: 30 });
      if (outcome.status === 'confirmed') {
        syncOccupancyStatus(stationId);
        get().logQa('reservation', 'pass', `Vaga reservada em ${station.name} (lock adquirido)`, stationId);
        return 'confirmed';
      }
      patchRuntime(stationId, (rt) => ({
        ...rt,
        status: rt.status === 'maintenance' ? rt.status : 'busy',
        reservations: [...rt.reservations, { id: uid('fila'), driver: CURRENT_USER_ID, createdAt: Date.now(), kind: 'queue' }],
      }));
      get().logQa('reservation', 'info', `Sem vagas livres em ${station.name} — entrou na fila virtual`, stationId);
      return 'queued';
    },

    cancelReservation: (stationId, reservationId) => {
      patchRuntime(stationId, (rt) => {
        const cancelled = rt.reservations.find((r) => r.id === reservationId);
        let reservations = rt.reservations.filter((r) => r.id !== reservationId);
        // Promote the head of the queue when a slot is released.
        if (cancelled?.kind === 'slot') {
          const head = reservations.find((r) => r.kind === 'queue');
          if (head) reservations = reservations.map((r) => (r.id === head.id ? { ...r, kind: 'slot' } : r));
        }
        return { ...rt, reservations };
      });
      syncOccupancyStatus(stationId);
      get().logQa('reservation', 'info', `Reserva cancelada em ${STATION_BY_ID[stationId].name}`, stationId);
    },

    toggleOcpp: (stationId) => {
      const online = !get().runtime[stationId].ocppOnline;
      patchRuntime(stationId, (rt) => ({ ...rt, ocppOnline: online }));
      get().logQa(
        'ocpp',
        online ? 'pass' : 'fail',
        online
          ? `OCPP restabelecido em ${STATION_BY_ID[stationId].name} (BootNotification aceito)`
          : `Heartbeat OCPP 1.6J perdido em ${STATION_BY_ID[stationId].name} — posto marcado offline`,
        stationId,
      );
    },

    dropRandomOcpp: (count) => {
      const online = get().stations.filter((s) => get().runtime[s.id].ocppOnline);
      const picked = [...online].sort(() => Math.random() - 0.5).slice(0, count);
      picked.forEach((s) => get().toggleOcpp(s.id));
      return picked.map((s) => s.id);
    },

    restoreAllOcpp: () => {
      get()
        .stations.filter((s) => !get().runtime[s.id].ocppOnline)
        .forEach((s) => get().toggleOcpp(s.id));
    },

    togglePowerSplit: (stationId) => {
      const split = !get().runtime[stationId].powerSplit;
      patchRuntime(stationId, (rt) => ({ ...rt, powerSplit: split }));
      get().logQa(
        'power',
        split ? 'warn' : 'info',
        split
          ? `Divisão de potência ativa em ${STATION_BY_ID[stationId].name}: 2 veículos no mesmo gabinete DC (potência / 2)`
          : `Divisão de potência desativada em ${STATION_BY_ID[stationId].name}`,
        stationId,
      );
    },

    traceRoute: async (stationId) => {
      const station = STATION_BY_ID[stationId];
      const { userLocation, simHour, vehicleId, batteryPct } = get();
      if (!userLocation) {
        set({ routeState: { status: 'error', stationId, message: 'Defina sua localização no mapa primeiro.' } });
        return;
      }
      if (!isOpenAt(station.hours, simHour)) {
        const message = `${station.name} está fechado às ${formatHour(simHour)} (${station.hoursLabel}). Rota bloqueada.`;
        set({ routeState: { status: 'error', stationId, message } });
        get().logQa('rule', 'warn', `Rota bloqueada por horário comercial: ${station.name}`, stationId);
        return;
      }
      routeAbort?.abort();
      const controller = new AbortController();
      routeAbort = controller;
      set({ routeState: { status: 'loading', stationId } });
      try {
        const route = await buildSmartRoute(
          userLocation,
          station.coords,
          VEHICLE_BY_ID[vehicleId],
          batteryPct,
          controller.signal,
          station.name,
        );
        if (controller.signal.aborted) return;
        set({ routeState: { status: 'ready', stationId, route } });
        get().logQa(
          'route',
          'info',
          `Rota até ${station.name}: ${route.distanceKm.toFixed(1)} km, ${route.options.length} alternativa(s), relevo ${route.energy.deltaPct >= 0 ? '+' : ''}${route.energy.deltaPct.toFixed(1)}% — ${route.choiceReason} (${route.routingSource}/${route.elevationSource})`,
          stationId,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        set({ routeState: { status: 'error', stationId, message: (err as Error).message } });
      }
    },

    selectRouteOption: (index) => {
      const { routeState, navigation } = get();
      if (routeState.status !== 'ready' || navigation || !routeState.route.options[index]) return;
      set({ routeState: { ...routeState, route: withOption(routeState.route, index) } });
      get().logQa('route', 'info', `Alternativa ${index + 1} de rota selecionada manualmente`, routeState.stationId);
    },

    clearRoute: () => {
      routeAbort?.abort();
      routeAbort = null;
      set({ routeState: { status: 'idle' }, navigation: null });
    },

    stations: [...SALVADOR_STATIONS, ...initialUserStations],
    stationForm: CLOSED_FORM,

    openStationForm: (editingId = null) => {
      const editing = editingId ? STATION_BY_ID[editingId] : null;
      set({
        stationForm: { open: true, editingId, picking: false, coords: editing?.coords ?? null },
        pickingLocation: false,
      });
    },
    closeStationForm: () => set({ stationForm: CLOSED_FORM }),
    setStationFormPicking: (picking) => set((s) => ({ stationForm: { ...s.stationForm, picking }, pickingLocation: false })),
    setStationFormCoords: (coords) => set((s) => ({ stationForm: { ...s.stationForm, coords, picking: false } })),

    saveStationDraft: (draft) => {
      const { stations, stationForm } = get();
      const validation = validateDraft(draft, stations, stationForm.editingId);
      if (!validation.ok) {
        get().logQa('rule', 'warn', `Cadastro de posto rejeitado: ${Object.values(validation.errors).join(' ')}`);
        return { ok: false, validation };
      }
      const editing = stationForm.editingId ? STATION_BY_ID[stationForm.editingId] : null;
      const station = editing
        ? stationFromDraft(draft, editing.id, editing.index, editing.createdAt)
        : stationFromDraft(draft, newStationId(draft.name), stations.length + 1);
      registerStation(station);
      const nextStations = editing ? stations.map((s) => (s.id === station.id ? station : s)) : [...stations, station];
      saveUserStations(nextStations);
      set((s) => ({
        stations: nextStations,
        runtime: {
          ...s.runtime,
          [station.id]: editing
            ? { ...s.runtime[station.id], sessions: s.runtime[station.id].sessions.slice(0, station.slots) }
            : seedRuntime(station),
        },
        stationForm: CLOSED_FORM,
      }));
      get().logQa(
        'rule',
        'pass',
        `${editing ? 'Posto atualizado' : 'Novo posto cadastrado'}: ${station.name} (${station.neighborhood})${
          validation.warnings.length ? ` — ${validation.warnings.join(' ')}` : ''
        }`,
        station.id,
      );
      get().selectStation(station.id);
      return { ok: true, id: station.id };
    },

    removeStation: (id) => {
      const station = STATION_BY_ID[id];
      if (!station || station.source !== 'user') return;
      const { routeState, selectedStationId } = get();
      if ('stationId' in routeState && routeState.stationId === id) get().clearRoute();
      const nextStations = get().stations.filter((s) => s.id !== id);
      saveUserStations(nextStations);
      unregisterStation(id);
      engines.delete(id);
      set((s) => {
        const runtime = { ...s.runtime };
        delete runtime[id];
        return { stations: nextStations, runtime, selectedStationId: selectedStationId === id ? null : selectedStationId };
      });
      get().logQa('rule', 'info', `Posto removido: ${station.name}`);
    },

    navigation: null,

    startNavigation: (mode) => {
      const { routeState, batteryPct } = get();
      if (routeState.status !== 'ready') return;
      const start = pointAlong(routeState.route.geometry, 0);
      set({
        navigation: {
          stationId: routeState.stationId,
          mode,
          paused: false,
          speed: 4,
          simKm: 0,
          simOffset: null,
          position: start.coords,
          heading: start.heading,
          follow: true,
          voice: true,
          rerouting: false,
          arrived: false,
          gpsError: null,
          routeStartBatteryPct: batteryPct,
          reroutes: 0,
        },
        sidebarOpen: false,
        selectedStationId: null,
        pickingLocation: false,
      });
      get().logQa(
        'route',
        'info',
        `Navegação ${mode === 'gps' ? 'por GPS' : 'simulada'} iniciada até ${STATION_BY_ID[routeState.stationId].name}`,
        routeState.stationId,
      );
    },

    stopNavigation: (openTab = 'route') => {
      const nav = get().navigation;
      if (!nav) return;
      const position = nav.arrived ? offsetCoords(STATION_BY_ID[nav.stationId].coords, 15, 200) : nav.position;
      set({ navigation: null, sidebarOpen: true });
      // Leave the driver where the trip ended, so on-site actions (check-in, reports) work.
      get().setUserLocation(position, nav.mode === 'gps' ? 'gps' : 'manual');
      get().selectStation(nav.stationId, openTab);
    },

    setNavPaused: (paused) => set((s) => (s.navigation ? { navigation: { ...s.navigation, paused } } : {})),
    setNavSpeed: (speed) => set((s) => (s.navigation ? { navigation: { ...s.navigation, speed } } : {})),
    setNavFollow: (follow) => set((s) => (s.navigation ? { navigation: { ...s.navigation, follow } } : {})),
    setNavVoice: (voice) => set((s) => (s.navigation ? { navigation: { ...s.navigation, voice } } : {})),
    setGpsError: (message) => set((s) => (s.navigation ? { navigation: { ...s.navigation, gpsError: message } } : {})),

    advanceSimulation: (dtSec) => {
      const { navigation: nav, routeState } = get();
      if (!nav || nav.mode !== 'simulated' || nav.paused || nav.arrived || nav.rerouting) return;
      if (routeState.status !== 'ready') return;
      const { route } = routeState;
      const avgSpeedKmPerSec = route.distanceKm / Math.max(1, route.durationMin * 60);
      const simKm = nav.simKm + avgSpeedKmPerSec * nav.speed * dtSec;
      const { coords, heading } = pointAlong(route.geometry, simKm);
      const position = nav.simOffset
        ? { lat: coords.lat + nav.simOffset.lat, lng: coords.lng + nav.simOffset.lng }
        : coords;
      set({ navigation: { ...nav, simKm, position, heading } });
    },

    updateGpsPosition: (coords, heading) => {
      const nav = get().navigation;
      if (!nav || nav.mode !== 'gps') return;
      const moved = Math.abs(coords.lat - nav.position.lat) + Math.abs(coords.lng - nav.position.lng) > 1e-6;
      const derived = moved
        ? (Math.atan2(coords.lng - nav.position.lng, coords.lat - nav.position.lat) * 180) / Math.PI
        : nav.heading;
      set({ navigation: { ...nav, position: coords, heading: heading ?? derived, gpsError: null } });
    },

    simulateDetour: () => {
      const nav = get().navigation;
      if (!nav || nav.mode !== 'simulated') return;
      // Jump 120 m to the right of the current heading: a missed turn.
      const off = offsetCoords(nav.position, 120, nav.heading + 90);
      set({
        navigation: {
          ...nav,
          simOffset: { lat: off.lat - nav.position.lat, lng: off.lng - nav.position.lng },
          position: off,
        },
      });
      get().logQa('route', 'warn', 'Desvio simulado: veículo saiu 120 m da rota', nav.stationId);
    },

    reroute: async () => {
      const { navigation: nav, routeState, vehicleId } = get();
      if (!nav || nav.rerouting || routeState.status !== 'ready') return;
      const station = STATION_BY_ID[nav.stationId];
      const { route: current } = routeState;
      const progress = computeProgress(current.geometry, current.steps, current.durationMin, nav.position);
      const vehicle = VEHICLE_BY_ID[vehicleId];
      const batteryNow = nav.routeStartBatteryPct - ((current.energy.realKwh * progress.progress) / vehicle.batteryKwh) * 100;
      set({ navigation: { ...nav, rerouting: true } });
      try {
        const route = await buildSmartRoute(nav.position, station.coords, vehicle, Math.max(0, batteryNow), undefined, station.name);
        const latest = get().navigation;
        if (!latest) return;
        const start = pointAlong(route.geometry, 0);
        const simulated = latest.mode === 'simulated';
        set({
          routeState: { status: 'ready', stationId: nav.stationId, route },
          navigation: {
            ...latest,
            rerouting: false,
            simKm: 0,
            simOffset: null,
            position: simulated ? start.coords : latest.position,
            heading: simulated ? start.heading : latest.heading,
            routeStartBatteryPct: Math.max(0, batteryNow),
            reroutes: latest.reroutes + 1,
          },
        });
        get().logQa('route', 'pass', `Rota recalculada após desvio (${route.distanceKm.toFixed(1)} km restantes)`, nav.stationId);
      } catch (err) {
        set((s) => (s.navigation ? { navigation: { ...s.navigation, rerouting: false } } : {}));
        get().logQa('route', 'fail', `Falha ao recalcular rota: ${(err as Error).message}`, nav.stationId);
      }
    },

    markArrived: () => {
      const { navigation: nav, routeState, vehicleId } = get();
      if (!nav || nav.arrived || routeState.status !== 'ready') return;
      const vehicle = VEHICLE_BY_ID[vehicleId];
      const arrivalPct = nav.routeStartBatteryPct - (routeState.route.energy.realKwh / vehicle.batteryKwh) * 100;
      set({ navigation: { ...nav, arrived: true, paused: true }, batteryPct: clamp(Math.round(arrivalPct), 5, 100) });
      get().logQa(
        'route',
        'pass',
        `Chegada em ${STATION_BY_ID[nav.stationId].name} com ${Math.max(0, arrivalPct).toFixed(0)}% de bateria`,
        nav.stationId,
      );
    },
  };

  function applyReport(stationId: string, report: CrowdReport) {
    const station = STATION_BY_ID[stationId];
    const rt = get().runtime[stationId];
    const reports = [...rt.reports, report];
    const resolution = resolveOfficialStatus(rt.status, reports);

    if (resolution.changed) {
      const delta = resolution.status === 'maintenance' ? -12 : rt.status === 'maintenance' ? 8 : 2;
      patchRuntime(stationId, (cur) => ({
        ...cur,
        status: resolution.status,
        reliability: clamp(cur.reliability + delta, 5, 99),
        reports: [],
      }));
      get().logQa(
        'crowd',
        'pass',
        `Status oficial de ${station.name} → ${resolution.status} (${resolution.reason})`,
        stationId,
      );
      return;
    }

    const confirmsCurrent = report.status === rt.status;
    patchRuntime(stationId, (cur) => ({
      ...cur,
      reports: confirmsCurrent ? cur.reports : reports,
      reliability: confirmsCurrent ? clamp(cur.reliability + 1, 5, 99) : cur.reliability,
    }));
    get().logQa(
      'crowd',
      'info',
      confirmsCurrent
        ? `${report.reporterId} confirmou o status atual de ${station.name}`
        : `Reporte "${report.status}" registrado em ${station.name} por ${report.reporterId} — aguardando consenso`,
      stationId,
    );
  }
});

if (typeof window !== 'undefined') {
  // Exposed for Playwright E2E scripts (deterministic state setup).
  (window as unknown as { __voltStore: typeof useAppStore }).__voltStore = useAppStore;
}
