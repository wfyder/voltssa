import { SALVADOR_STATIONS, STATION_BY_ID, VEHICLE_BY_ID } from '../data/salvadorStations';
import type { CrowdReport } from '../types';
import { bestConnector, effectivePowerKw, isCompatible } from './compatibility';
import { resolveOfficialStatus, validateReport } from './crowd';
import { offsetCoords } from './geo';
import { isOpenAt } from './hours';
import { estimateCharge, parkingCost } from './pricing';
import { simulateLastSlotRace } from './reservationEngine';

export interface SelfTestResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

type Check = { id: string; name: string; run: () => Promise<string> | string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

const report = (reporterId: string, status: CrowdReport['status'], method: CrowdReport['method'] = 'report'): CrowdReport => ({
  id: `${reporterId}-${status}`,
  reporterId,
  status,
  createdAt: 0,
  distanceM: 10,
  method,
});

const CHECKS: Check[] = [
  {
    id: 'data-integrity',
    name: 'Base de dados: 43 eletropostos únicos dentro de Salvador',
    run: () => {
      const ids = new Set(SALVADOR_STATIONS.map((s) => s.id));
      assert(SALVADOR_STATIONS.length === 43, `esperado 43, obtido ${SALVADOR_STATIONS.length}`);
      assert(ids.size === SALVADOR_STATIONS.length, 'IDs duplicados');
      const outside = SALVADOR_STATIONS.filter(
        (s) => s.coords.lat < -13.05 || s.coords.lat > -12.85 || s.coords.lng < -38.56 || s.coords.lng > -38.3,
      );
      assert(outside.length === 0, `fora do bbox: ${outside.map((s) => s.name).join(', ')}`);
      return `${ids.size} IDs únicos, todos no bbox de Salvador`;
    },
  },
  {
    id: 'tou-peak-split',
    name: 'Tarifa dinâmica Turbo Recarga: cálculo proporcional cruzando 16h',
    run: () => {
      const station = STATION_BY_ID['turbo-recarga-posto-aeroporto'];
      const vehicle = VEHICLE_BY_ID['volvo-ex30'];
      const connector = bestConnector(station, vehicle);
      const base = { station, vehicle, connector, currentPct: 10, targetPct: 80 };
      const crossing = estimateCharge({ ...base, startHour: 15, startMinute: 30 });
      const offPeak = estimateCharge({ ...base, startHour: 10 });
      const peak = estimateCharge({ ...base, startHour: 17 });
      assert(crossing.crossesPeak, 'recarga 15:30 deveria cruzar a ponta');
      assert(crossing.buckets.length === 2, 'esperados 2 blocos tarifários');
      assert(near(offPeak.energyCost / offPeak.energyBilledKwh, 1.99), 'fora de ponta ≠ R$1,99');
      assert(near(peak.energyCost / peak.energyBilledKwh, 2.99), 'ponta ≠ R$2,99');
      assert(crossing.energyCost > offPeak.energyCost && crossing.energyCost < peak.energyCost, 'custo misto fora do intervalo');
      return `fora de ponta R$${offPeak.energyCost.toFixed(2)} < misto R$${crossing.energyCost.toFixed(2)} < ponta R$${peak.energyCost.toFixed(2)}`;
    },
  },
  {
    id: 'business-hours',
    name: 'Horário comercial: Hiperideal fecha 21h, Assaí 22h, concessionária 18h',
    run: () => {
      const hiper = STATION_BY_ID['hiperideal-vitoria'];
      const assai = STATION_BY_ID['assai-paralela-imbui'];
      const audi = STATION_BY_ID['audi-center-salvador'];
      const dulce = STATION_BY_ID['posto-dulce'];
      assert(isOpenAt(hiper.hours, 20) && !isOpenAt(hiper.hours, 21), 'Hiperideal');
      assert(isOpenAt(assai.hours, 21) && !isOpenAt(assai.hours, 22), 'Assaí');
      assert(isOpenAt(audi.hours, 17) && !isOpenAt(audi.hours, 18), 'Audi');
      assert(isOpenAt(dulce.hours, 3), 'Posto 24h deveria estar aberto às 03h');
      return 'limites de abertura/fechamento corretos (intervalo semiaberto)';
    },
  },
  {
    id: 'geo-fraud',
    name: 'Antifraude: reporte de quebra exige distância < 100 m (turf.distance)',
    run: () => {
      const station = STATION_BY_ID['posto-dulce'];
      const base = { status: 'maintenance' as const, method: 'report' as const, reporterId: 'qa', stationCoords: station.coords, existingReports: [] };
      const far = validateReport({ ...base, userLocation: offsetCoords(station.coords, 2000, 90) });
      const close = validateReport({ ...base, userLocation: offsetCoords(station.coords, 50, 90) });
      const edge = validateReport({ ...base, userLocation: offsetCoords(station.coords, 120, 90) });
      const none = validateReport({ ...base, userLocation: null });
      assert(!far.ok && far.code === 'GEO_FRAUD', '2 km deveria ser bloqueado');
      assert(!edge.ok, '120 m deveria ser bloqueado');
      assert(close.ok, '50 m deveria ser permitido');
      assert(!none.ok && none.code === 'NO_LOCATION', 'sem localização deveria ser bloqueado');
      return 'bloqueia 2 km / 120 m / sem GPS, permite 50 m';
    },
  },
  {
    id: 'crowd-consensus',
    name: 'Consenso: 3 reportes independentes ou 1 check-in mudam o status',
    run: () => {
      const two = resolveOfficialStatus('available', [report('a', 'maintenance'), report('b', 'maintenance')]);
      const dup = resolveOfficialStatus('available', [report('a', 'maintenance'), report('a', 'maintenance'), report('a', 'maintenance')]);
      const three = resolveOfficialStatus('available', [report('a', 'maintenance'), report('b', 'maintenance'), report('c', 'maintenance')]);
      const checkin = resolveOfficialStatus('maintenance', [report('x', 'available', 'checkin')]);
      assert(!two.changed, '2 reportes não deveriam mudar');
      assert(!dup.changed, 'mesmo motorista 3x não deveria mudar');
      assert(three.changed && three.status === 'maintenance', '3 reportes deveriam mudar');
      assert(checkin.changed && checkin.status === 'available', 'check-in deveria mudar');
      return '2 → mantém · 3 (mesmo autor) → mantém · 3 distintos → muda · check-in → muda';
    },
  },
  {
    id: 'plug-compat',
    name: 'Compatibilidade de plugue por veículo',
    run: () => {
      const dc = STATION_BY_ID['posto-dulce'];
      const ac = STATION_BY_ID['shopping-paseo'];
      assert(!isCompatible(dc, VEHICLE_BY_ID['nissan-leaf']), 'Leaf (CHAdeMO) × CCS2');
      assert(!isCompatible(dc, VEHICLE_BY_ID['phev']), 'PHEV × DC');
      assert(isCompatible(ac, VEHICLE_BY_ID['phev']), 'PHEV × Tipo 2');
      assert(isCompatible(dc, VEHICLE_BY_ID['byd-dolphin-mini']), 'Dolphin Mini × CCS2');
      return 'Leaf/PHEV bloqueados em CCS2; Tipo 2 aceito';
    },
  },
  {
    id: 'parking-trap',
    name: 'Pegadinha do estacionamento: cobrança por hora iniciada',
    run: () => {
      const ss = STATION_BY_ID['salvador-shopping'].parking;
      const sb = STATION_BY_ID['shopping-da-bahia'].parking;
      assert(parkingCost(ss, 240) === 15, 'SSA 4h = R$15');
      assert(parkingCost(ss, 250) === 16, 'SSA 4h10 = R$16');
      assert(parkingCost(sb, 180) === 26, 'Shopping da Bahia 3h = R$26');
      return 'SSA 4h=R$15, 4h10=R$16 · S. da Bahia 3h=R$26';
    },
  },
  {
    id: 'unlock-fee',
    name: 'Taxa de ativação Shell (R$ 1,71) somada ao total',
    run: () => {
      const station = STATION_BY_ID['posto-shell-aguas-claras'];
      const vehicle = VEHICLE_BY_ID['byd-dolphin-mini'];
      const est = estimateCharge({ station, vehicle, connector: bestConnector(station, vehicle), currentPct: 20, targetPct: 80, startHour: 12 });
      assert(near(est.total, est.energyCost + 1.71), 'total ≠ energia + taxa');
      return `energia R$${est.energyCost.toFixed(2)} + taxa R$1,71 = R$${est.total.toFixed(2)}`;
    },
  },
  {
    id: 'power-split',
    name: 'Divisão de potência: 2 carros no mesmo DC dividem a potência',
    run: () => {
      const station = STATION_BY_ID['eletroposto-av-tancredo-neves'];
      const vehicle = VEHICLE_BY_ID['volvo-ex30'];
      const c = bestConnector(station, vehicle);
      assert(effectivePowerKw(c, vehicle, false) === 77, '77 kW esperado');
      assert(effectivePowerKw(c, vehicle, true) === 38.5, '38.5 kW esperado');
      return '77 kW → 38,5 kW por veículo';
    },
  },
  {
    id: 'race-condition',
    name: 'Race condition: mutex impede overbooking da última vaga',
    run: async () => {
      const unsafe = await simulateLastSlotRace(false, 15);
      const safe = await simulateLastSlotRace(true, 15);
      assert(unsafe.overbooked, 'sem lock deveria reproduzir o bug (overbooking)');
      assert(!safe.overbooked && safe.finalTaken === 1, 'com lock deveria haver 1 reserva');
      return `sem lock: ${unsafe.finalTaken}/1 (bug reproduzido) · com lock: ${safe.finalTaken}/1`;
    },
  },
];

export async function runSelfTests(): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  for (const check of CHECKS) {
    try {
      const detail = await check.run();
      results.push({ id: check.id, name: check.name, passed: true, detail });
    } catch (err) {
      results.push({ id: check.id, name: check.name, passed: false, detail: (err as Error).message });
    }
  }
  return results;
}
