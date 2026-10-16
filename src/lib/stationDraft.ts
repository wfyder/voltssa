import { isInsideSalvador } from '../data/cityZones';
import type { Connector, Coordinates, OpeningHours, ParkingRule, PlugType, Station, StationCategory } from '../types';
import { AC_MAX_KW, PLUG_LABEL } from './compatibility';
import { distanceMeters } from './geo';
import { formatBRL, formatHour } from './utils';

/** Another station closer than this is flagged as a possible duplicate. */
export const DUPLICATE_RADIUS_M = 40;
export const DC_MIN_KW = 15;
export const DC_MAX_KW = 400;
const STORAGE_KEY = 'voltssa.customStations.v1';

export interface ConnectorDraft {
  type: PlugType;
  powerKw: number;
  pricePerKwh: number;
}

export type ParkingKind = 'unknown' | 'free' | 'flat' | 'hourly';

/** Form state for creating or editing a user station. */
export interface StationDraft {
  name: string;
  neighborhood: string;
  address: string;
  category: StationCategory;
  coords: Coordinates | null;
  connectors: ConnectorDraft[];
  slots: number;
  is24h: boolean;
  open: number;
  close: number;
  parkingKind: ParkingKind;
  /** Flat price, or first-hour price when `hourly`. */
  parkingPrice: number;
  parkingExtraPerHour: number;
  unlockFee: number;
  notes: string;
}

export const EMPTY_DRAFT: StationDraft = {
  name: '',
  neighborhood: '',
  address: '',
  category: 'business',
  coords: null,
  connectors: [{ type: 'TYPE2_AC', powerKw: 7.4, pricePerKwh: 0 }],
  slots: 1,
  is24h: false,
  open: 8,
  close: 22,
  parkingKind: 'unknown',
  parkingPrice: 0,
  parkingExtraPerHour: 0,
  unlockFee: 0,
  notes: '',
};

export type DraftField = 'name' | 'neighborhood' | 'coords' | 'connectors' | 'slots' | 'hours' | 'parking' | 'unlockFee';

export interface DraftValidation {
  ok: boolean;
  errors: Partial<Record<DraftField, string>>;
  warnings: string[];
}

const normalize = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const between = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;

/**
 * QA rules for crowd-sourced stations: coordinates inside Salvador, power coherent with
 * the plug standard, sane prices/hours, and no duplicates of existing stations.
 */
export function validateDraft(draft: StationDraft, existing: Station[], editingId: string | null = null): DraftValidation {
  const errors: DraftValidation['errors'] = {};
  const warnings: string[] = [];
  const others = existing.filter((s) => s.id !== editingId);

  const name = draft.name.trim();
  if (name.length < 3) errors.name = 'Informe um nome com pelo menos 3 letras.';
  else if (name.length > 80) errors.name = 'Nome muito longo (máximo 80 caracteres).';
  else {
    const twin = others.find((s) => normalize(s.name) === normalize(name));
    if (twin) errors.name = `Já existe um posto com esse nome (${twin.neighborhood}).`;
  }

  if (draft.neighborhood.trim().length < 2) errors.neighborhood = 'Informe o bairro.';

  if (!draft.coords) errors.coords = 'Escolha a localização no mapa.';
  else if (!isInsideSalvador(draft.coords)) errors.coords = 'A localização está fora de Salvador.';
  else {
    const close = others
      .map((s) => ({ s, d: distanceMeters(draft.coords!, s.coords) }))
      .filter((x) => x.d <= DUPLICATE_RADIUS_M)
      .sort((a, b) => a.d - b.d)[0];
    if (close) warnings.push(`Possível duplicata: ${close.s.name} fica a ${Math.round(close.d)} m deste ponto.`);
  }

  if (draft.connectors.length === 0) errors.connectors = 'Adicione pelo menos um conector.';
  else {
    for (const c of draft.connectors) {
      const label = PLUG_LABEL[c.type];
      if (c.type === 'TYPE2_AC' && !between(c.powerKw, 1, AC_MAX_KW)) {
        errors.connectors = `${label}: potência deve ficar entre 1 e ${AC_MAX_KW} kW.`;
        break;
      }
      if (c.type !== 'TYPE2_AC' && !between(c.powerKw, DC_MIN_KW, DC_MAX_KW)) {
        errors.connectors = `${label}: potência deve ficar entre ${DC_MIN_KW} e ${DC_MAX_KW} kW.`;
        break;
      }
      if (!between(c.pricePerKwh, 0, 10)) {
        errors.connectors = `${label}: preço por kWh deve ficar entre R$ 0 e R$ 10.`;
        break;
      }
    }
  }

  if (!Number.isInteger(draft.slots) || !between(draft.slots, 1, 100)) errors.slots = 'Número de vagas entre 1 e 100.';

  if (!draft.is24h && !(between(draft.open, 0, 23) && between(draft.close, 1, 24) && draft.open < draft.close)) {
    errors.hours = 'O horário de abertura precisa ser antes do fechamento.';
  }

  if ((draft.parkingKind === 'flat' || draft.parkingKind === 'hourly') && !between(draft.parkingPrice, 0, 200)) {
    errors.parking = 'Valor de estacionamento entre R$ 0 e R$ 200.';
  }
  if (draft.parkingKind === 'hourly' && !between(draft.parkingExtraPerHour, 0, 100)) {
    errors.parking = 'Valor por hora adicional entre R$ 0 e R$ 100.';
  }

  if (!between(draft.unlockFee, 0, 20)) errors.unlockFee = 'Taxa de ativação entre R$ 0 e R$ 20.';

  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

const slugify = (v: string) =>
  normalize(v)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function newStationId(name: string): string {
  return `user-${slugify(name).slice(0, 40)}-${Date.now().toString(36)}`;
}

function parkingRule(d: StationDraft): { rule: ParkingRule; label: string } {
  switch (d.parkingKind) {
    case 'free':
      return { rule: { kind: 'free' }, label: 'Gratuito' };
    case 'flat':
      return { rule: { kind: 'flat', price: d.parkingPrice }, label: formatBRL(d.parkingPrice) };
    case 'hourly':
      return {
        rule: { kind: 'block', blockHours: 1, price: d.parkingPrice, extraPerHour: d.parkingExtraPerHour },
        label: `${formatBRL(d.parkingPrice)} (1ª h) + ${formatBRL(d.parkingExtraPerHour)}/h adic.`,
      };
    default:
      return { rule: { kind: 'unknown' }, label: 'Não informado' };
  }
}

/** Builds a full `Station` from a validated draft. */
export function stationFromDraft(d: StationDraft, id: string, index: number, createdAt = Date.now()): Station {
  if (!d.coords) throw new Error('Draft without coordinates');
  const connectors: Connector[] = d.connectors.map((c) => ({
    type: c.type,
    powerKw: c.powerKw,
    tariff: { kind: 'flat', pricePerKwh: c.pricePerKwh },
  }));
  const hours: OpeningHours | null = d.is24h ? null : { open: d.open, close: d.close };
  const prices = [...new Set(d.connectors.map((c) => c.pricePerKwh))];
  const parking = parkingRule(d);
  return {
    id,
    index,
    name: d.name.trim(),
    neighborhood: d.neighborhood.trim(),
    address: d.address.trim() || 'Endereço não informado',
    coords: d.coords,
    category: d.category,
    connectors,
    slots: d.slots,
    powerLabel: d.connectors.map((c) => `${c.powerKw} kW (${c.type === 'TYPE2_AC' ? 'AC' : 'DC'})`).join(' / '),
    priceLabel: prices.length === 1 && prices[0] === 0 ? 'Gratuito' : prices.map((p) => `${formatBRL(p)}/kWh`).join(' ou '),
    parkingLabel: parking.label,
    hoursLabel: d.is24h ? '24h' : `${formatHour(d.open)} às ${formatHour(d.close)}`,
    parking: parking.rule,
    hours,
    unlockFee: d.unlockFee,
    hasIndoorMap: false,
    initialStatus: 'available',
    baseReliability: 50,
    notes: d.notes.trim() || undefined,
    source: 'user',
    createdAt,
  };
}

/** Inverse of `stationFromDraft`, used to edit a user station. */
export function draftFromStation(s: Station): StationDraft {
  const parking: Pick<StationDraft, 'parkingKind' | 'parkingPrice' | 'parkingExtraPerHour'> =
    s.parking.kind === 'free'
      ? { parkingKind: 'free', parkingPrice: 0, parkingExtraPerHour: 0 }
      : s.parking.kind === 'flat'
        ? { parkingKind: 'flat', parkingPrice: s.parking.price, parkingExtraPerHour: 0 }
        : s.parking.kind === 'block'
          ? { parkingKind: 'hourly', parkingPrice: s.parking.price, parkingExtraPerHour: s.parking.extraPerHour ?? 0 }
          : { parkingKind: 'unknown', parkingPrice: 0, parkingExtraPerHour: 0 };
  return {
    name: s.name,
    neighborhood: s.neighborhood,
    address: s.address === 'Endereço não informado' ? '' : s.address,
    category: s.category,
    coords: s.coords,
    connectors: s.connectors.map((c) => ({
      type: c.type,
      powerKw: c.powerKw,
      pricePerKwh: c.tariff.kind === 'flat' ? c.tariff.pricePerKwh : 0,
    })),
    slots: s.slots,
    is24h: s.hours === null,
    open: s.hours?.open ?? 8,
    close: s.hours?.close ?? 22,
    ...parking,
    unlockFee: s.unlockFee,
    notes: s.notes ?? '',
  };
}

/* -------------------------------------------------------------------------- */
/*  Local persistence (per browser)                                           */
/* -------------------------------------------------------------------------- */

/** Ids of user stations; anything else in storage is rejected (no overriding curated ids). */
export const USER_STATION_ID = /^user-[a-z0-9-]{1,80}$/;
const BACKUP_KEY = `${STORAGE_KEY}.corrupt`;
const MAX_STORED = 200;

const PLUG_TYPES: PlugType[] = ['TYPE2_AC', 'CCS2_DC', 'CHADEMO_DC'];
const CATEGORIES: StationCategory[] = ['shopping', 'fuel_dc', 'supermarket', 'business'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cleanText = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : null;
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Rebuilds a draft from an untrusted stored value, field by field. Returns null when any
 * field has the wrong type — the caller then runs the same QA rules as the form.
 */
export function draftFromStored(v: unknown): { id: string; createdAt?: number; draft: StationDraft } | null {
  if (!isRecord(v)) return null;
  const id = cleanText(v.id, 120);
  const name = cleanText(v.name, 120);
  const neighborhood = cleanText(v.neighborhood, 80);
  if (!id || !USER_STATION_ID.test(id) || name === null || neighborhood === null) return null;
  const category = CATEGORIES.find((c) => c === v.category);
  if (!category) return null;

  if (!isRecord(v.coords)) return null;
  const lat = finite(v.coords.lat);
  const lng = finite(v.coords.lng);
  if (lat === null || lng === null) return null;

  if (!Array.isArray(v.connectors) || v.connectors.length === 0 || v.connectors.length > 8) return null;
  const connectors: ConnectorDraft[] = [];
  for (const c of v.connectors) {
    if (!isRecord(c) || !isRecord(c.tariff) || c.tariff.kind !== 'flat') return null;
    const type = PLUG_TYPES.find((t) => t === c.type);
    const powerKw = finite(c.powerKw);
    const pricePerKwh = finite(c.tariff.pricePerKwh);
    if (!type || powerKw === null || pricePerKwh === null) return null;
    connectors.push({ type, powerKw, pricePerKwh });
  }

  const slots = finite(v.slots);
  if (slots === null) return null;

  let is24h = false;
  let open = 8;
  let close = 22;
  if (v.hours === null) is24h = true;
  else if (isRecord(v.hours) && finite(v.hours.open) !== null && finite(v.hours.close) !== null) {
    open = v.hours.open as number;
    close = v.hours.close as number;
  } else return null;

  let parking: Pick<StationDraft, 'parkingKind' | 'parkingPrice' | 'parkingExtraPerHour'> = {
    parkingKind: 'unknown',
    parkingPrice: 0,
    parkingExtraPerHour: 0,
  };
  const pk = isRecord(v.parking) ? v.parking : null;
  if (!pk) return null;
  if (pk.kind === 'free') parking = { ...parking, parkingKind: 'free' };
  else if (pk.kind === 'flat' && finite(pk.price) !== null) parking = { ...parking, parkingKind: 'flat', parkingPrice: pk.price as number };
  else if (pk.kind === 'block' && finite(pk.price) !== null && finite(pk.extraPerHour) !== null)
    parking = { parkingKind: 'hourly', parkingPrice: pk.price as number, parkingExtraPerHour: pk.extraPerHour as number };
  else if (pk.kind !== 'unknown') return null;

  const address = cleanText(v.address, 160) ?? '';
  const draft: StationDraft = {
    name,
    neighborhood,
    address: address === 'Endereço não informado' ? '' : address,
    category,
    coords: { lat, lng },
    connectors,
    slots,
    is24h,
    open,
    close,
    ...parking,
    unlockFee: finite(v.unlockFee) ?? 0,
    notes: cleanText(v.notes, 500) ?? '',
  };
  return { id, createdAt: finite(v.createdAt) ?? undefined, draft };
}

export interface StoredStations {
  stations: Station[];
  /** Entries that failed parsing or the QA rules (kept in a backup key, never silently lost). */
  discarded: number;
}

/**
 * Parses the persisted list. Every entry is rebuilt and must pass `validateDraft` against the
 * curated survey and the entries accepted before it — the same rules as the add/edit form.
 */
export function parseStoredStations(raw: string | null, curated: Station[]): StoredStations {
  if (!raw) return { stations: [], discarded: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { stations: [], discarded: 1 };
  }
  if (!Array.isArray(parsed)) return { stations: [], discarded: 1 };

  const curatedIds = new Set(curated.map((c) => c.id));
  const accepted: Station[] = [];
  let discarded = Math.max(0, parsed.length - MAX_STORED);
  for (const entry of parsed.slice(0, MAX_STORED)) {
    const rebuilt = draftFromStored(entry);
    if (!rebuilt || curatedIds.has(rebuilt.id) || accepted.some((s) => s.id === rebuilt.id)) {
      discarded++;
      continue;
    }
    if (!validateDraft(rebuilt.draft, [...curated, ...accepted], rebuilt.id).ok) {
      discarded++;
      continue;
    }
    accepted.push(stationFromDraft(rebuilt.draft, rebuilt.id, curated.length + accepted.length + 1, rebuilt.createdAt));
  }
  return { stations: accepted, discarded };
}

export function loadUserStations(curated: Station[]): StoredStations {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const result = parseStoredStations(raw, curated);
    // Keep the original blob before any later save rewrites the key.
    if (result.discarded > 0 && raw) localStorage.setItem(BACKUP_KEY, raw);
    return result;
  } catch {
    return { stations: [], discarded: 0 };
  }
}

export function saveUserStations(stations: Station[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stations.filter((s) => s.source === 'user')));
  } catch {
    /* storage unavailable (private mode) — stations live for this session only */
  }
}

export function clearUserStations(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(BACKUP_KEY, raw);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
