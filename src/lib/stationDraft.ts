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

const isStation = (v: unknown): v is Station => {
  const s = v as Station;
  return (
    !!s &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.coords?.lat === 'number' &&
    typeof s.coords?.lng === 'number' &&
    Array.isArray(s.connectors) &&
    s.connectors.length > 0
  );
};

export function loadUserStations(): Station[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStation).map((s) => ({ ...s, source: 'user' as const })) : [];
  } catch {
    return [];
  }
}

export function saveUserStations(stations: Station[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stations.filter((s) => s.source === 'user')));
  } catch {
    /* storage unavailable (private mode) — stations live for this session only */
  }
}
