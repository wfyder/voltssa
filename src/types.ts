export type PlugType = 'TYPE2_AC' | 'CCS2_DC' | 'CHADEMO_DC';

export type StationStatus = 'available' | 'busy' | 'maintenance';

export type StationCategory = 'shopping' | 'fuel_dc' | 'supermarket' | 'business';

export interface Coordinates {
  lat: number;
  lng: number;
}

/** Energy tariff applied to a connector. `tou` = time-of-use (peak / off-peak). */
export type Tariff =
  | { kind: 'flat'; pricePerKwh: number }
  | { kind: 'tou'; offPeak: number; peak: number; peakStartHour: number; peakEndHour: number }
  | { kind: 'restricted'; reason: string };

export interface Connector {
  type: PlugType;
  powerKw: number;
  tariff: Tariff;
}

/** Parking billing rule, evaluated against the charging duration. */
export type ParkingRule =
  | { kind: 'free' }
  | { kind: 'unknown' }
  | { kind: 'flat'; price: number }
  /** `price` covers the first `blockHours`; each extra started hour costs `extraPerHour`.
   *  When `extraPerHour` is null the whole block is charged again. */
  | { kind: 'block'; blockHours: number; price: number; extraPerHour: number | null };

/** Opening hours in local time. `null` means 24h operation. */
export interface OpeningHours {
  open: number; // hour 0-23
  close: number; // hour 1-24 (exclusive)
}

export interface Station {
  id: string;
  index: number;
  name: string;
  neighborhood: string;
  address: string;
  coords: Coordinates;
  category: StationCategory;
  connectors: Connector[];
  /** Number of charging bays. */
  slots: number;
  /** Raw power label, kept verbatim from the source survey. */
  powerLabel: string;
  priceLabel: string;
  parkingLabel: string;
  hoursLabel: string;
  parking: ParkingRule;
  hours: OpeningHours | null;
  unlockFee: number;
  hasIndoorMap: boolean;
  initialStatus: StationStatus;
  baseReliability: number;
  notes?: string;
  /** `survey` = curated dataset; `user` = added in the app (not verified). */
  source: 'survey' | 'user';
  createdAt?: number;
}

export interface Vehicle {
  id: string;
  name: string;
  batteryKwh: number;
  plugs: PlugType[];
  maxAcKw: number;
  maxDcKw: number;
  /** Flat-road consumption in kWh/km. */
  consumptionKwhPerKm: number;
  massKg: number;
  description: string;
}

export interface ChargingSession {
  id: string;
  driver: string;
  remainingMin: number;
}

export interface Reservation {
  id: string;
  driver: string;
  createdAt: number;
  kind: 'slot' | 'queue';
}

export interface CrowdReport {
  id: string;
  reporterId: string;
  status: StationStatus;
  createdAt: number;
  distanceM: number | null;
  method: 'report' | 'checkin';
}

export interface StationRuntime {
  status: StationStatus;
  reliability: number;
  sessions: ChargingSession[];
  reservations: Reservation[];
  reports: CrowdReport[];
  ocppOnline: boolean;
  powerSplit: boolean;
}

export type QaSeverity = 'info' | 'pass' | 'warn' | 'fail';

export interface QaEvent {
  id: string;
  at: number;
  category: 'fraud' | 'race' | 'ocpp' | 'power' | 'reservation' | 'crowd' | 'rule' | 'route' | 'selftest';
  severity: QaSeverity;
  message: string;
  stationId?: string;
}
