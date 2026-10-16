import type { Coordinates, CrowdReport, StationStatus } from '../types';
import { distanceMeters, FRAUD_RADIUS_M } from './geo';

/** Independent reports needed before the official status flips. */
export const REPORTS_REQUIRED = 3;

export type ReportVerdict =
  | { ok: true; distanceM: number | null }
  | { ok: false; code: 'NO_LOCATION' | 'GEO_FRAUD' | 'DUPLICATE'; distanceM: number | null; message: string };

interface ReportCheck {
  status: StationStatus;
  method: 'report' | 'checkin';
  reporterId: string;
  userLocation: Coordinates | null;
  stationCoords: Coordinates;
  existingReports: CrowdReport[];
}

/**
 * Anti-fraud gate.
 *  - "Broken" reports and on-site check-ins must come from within FRAUD_RADIUS_M (turf.distance).
 *  - The same reporter cannot vote twice for the same status while it is pending.
 */
export function validateReport(check: ReportCheck): ReportVerdict {
  const needsPresence = check.status === 'maintenance' || check.method === 'checkin';
  const distanceM = check.userLocation ? distanceMeters(check.userLocation, check.stationCoords) : null;

  if (needsPresence) {
    if (distanceM === null) {
      return {
        ok: false,
        code: 'NO_LOCATION',
        distanceM,
        message: 'Defina sua localização no mapa antes de reportar um posto quebrado.',
      };
    }
    if (distanceM > FRAUD_RADIUS_M) {
      return {
        ok: false,
        code: 'GEO_FRAUD',
        distanceM,
        message: `Você está a ${Math.round(distanceM)} m do posto. Reportes de quebra exigem presença física (< ${FRAUD_RADIUS_M} m).`,
      };
    }
  }

  const duplicate = check.existingReports.some(
    (r) => r.reporterId === check.reporterId && r.status === check.status && r.method === 'report',
  );
  if (duplicate && check.method === 'report') {
    return {
      ok: false,
      code: 'DUPLICATE',
      distanceM,
      message: 'Você já reportou este status. Aguarde a confirmação de outros motoristas.',
    };
  }

  return { ok: true, distanceM };
}

/**
 * Consensus rule: a check-in flips the status immediately; otherwise REPORTS_REQUIRED
 * distinct reporters must agree on the same status.
 */
export function resolveOfficialStatus(
  current: StationStatus,
  reports: CrowdReport[],
): { status: StationStatus; changed: boolean; reason: string | null } {
  const checkin = [...reports].reverse().find((r) => r.method === 'checkin');
  if (checkin && checkin.status !== current) {
    return { status: checkin.status, changed: true, reason: 'Check-in presencial confirmado' };
  }

  const counts = new Map<StationStatus, Set<string>>();
  for (const r of reports) {
    if (r.method !== 'report' || r.status === current) continue;
    const set = counts.get(r.status) ?? new Set<string>();
    set.add(r.reporterId);
    counts.set(r.status, set);
  }
  for (const [status, reporters] of counts) {
    if (reporters.size >= REPORTS_REQUIRED) {
      return { status, changed: true, reason: `${reporters.size} reportes independentes` };
    }
  }
  return { status: current, changed: false, reason: null };
}

export function pendingVotes(current: StationStatus, reports: CrowdReport[], status: StationStatus): number {
  if (status === current) return 0;
  return new Set(reports.filter((r) => r.method === 'report' && r.status === status).map((r) => r.reporterId)).size;
}
