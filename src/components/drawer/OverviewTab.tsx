import type { ReactNode } from 'react';
import { CATEGORY_LABEL, VEHICLE_BY_ID } from '../../data/salvadorStations';
import { effectivePowerKw, PLUG_LABEL, vehicleLimitKw } from '../../lib/compatibility';
import { pendingVotes, REPORTS_REQUIRED } from '../../lib/crowd';
import { distanceMeters, FRAUD_RADIUS_M } from '../../lib/geo';
import { cn, formatBRL, formatDistance } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import type { Station, StationRuntime, StationStatus, Tariff } from '../../types';
import { Button, ReliabilityBar, Section, STATUS_LABEL } from '../ui';

function tariffLabel(t: Tariff): string {
  if (t.kind === 'flat') return t.pricePerKwh === 0 ? 'Gratuito' : `${formatBRL(t.pricePerKwh)}/kWh`;
  if (t.kind === 'tou') return `${formatBRL(t.offPeak)} fora de ponta, ${formatBRL(t.peak)} das ${t.peakStartHour}h às ${t.peakEndHour}h`;
  return t.reason;
}

const STATUSES: StationStatus[] = ['available', 'busy', 'maintenance'];

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-fg" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

export function OverviewTab({ station, runtime }: { station: Station; runtime: StationRuntime }) {
  const vehicleId = useAppStore((s) => s.vehicleId);
  const userLocation = useAppStore((s) => s.userLocation);
  const submitReport = useAppStore((s) => s.submitReport);
  const simulateOtherDriverReport = useAppStore((s) => s.simulateOtherDriverReport);
  const simulatePresenceAt = useAppStore((s) => s.simulatePresenceAt);
  const vehicle = VEHICLE_BY_ID[vehicleId];

  const distanceM = userLocation ? distanceMeters(userLocation, station.coords) : null;
  const onSite = distanceM !== null && distanceM <= FRAUD_RADIUS_M;

  return (
    <div>
      <Section title="Informações">
        <dl className="divide-y divide-line">
          <Row label="Endereço" testId="station-address">
            {station.address}
          </Row>
          <Row label="Tipo">{CATEGORY_LABEL[station.category]}</Row>
          <Row label="Horário">{station.hoursLabel}</Row>
          <Row label="Vagas">{station.slots}</Row>
          <Row label="Preço">{station.priceLabel}</Row>
          <Row label="Estacionamento">{station.parkingLabel}</Row>
          {station.unlockFee > 0 && <Row label="Taxa de ativação">{formatBRL(station.unlockFee)}</Row>}
        </dl>
        {station.notes && <p className="mt-2 text-xs text-muted">{station.notes}</p>}
      </Section>

      <Section title="Conectores">
        <ul className="divide-y divide-line">
          {station.connectors.map((c, i) => {
            const ok = vehicleLimitKw(vehicle, c.type) > 0;
            return (
              <li
                key={i}
                data-testid={`connector-${station.id}-${c.type}`}
                data-compatible={ok}
                className="flex items-baseline justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <div className="text-fg">
                    {PLUG_LABEL[c.type]}, {c.powerKw} kW
                  </div>
                  <div className="text-xs text-muted">{tariffLabel(c.tariff)}</div>
                </div>
                {ok ? (
                  <span className="text-xs text-muted tabular-nums">
                    {effectivePowerKw(c, vehicle, runtime.powerSplit).toFixed(1)} kW no seu carro
                  </span>
                ) : (
                  <span className="text-xs text-red-400" data-testid="badge-connector-incompatible">
                    Incompatível
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {runtime.powerSplit && <p className="mt-2 text-xs text-amber-400">Potência dividida: dois carros no mesmo carregador DC.</p>}
      </Section>

      <Section title="Status colaborativo">
        <div className="mb-1 text-xs text-muted">Confiabilidade</div>
        <ReliabilityBar value={runtime.reliability} testId="reliability-score" />

        <p
          data-testid="user-distance-to-station"
          className={cn('mt-3 text-xs', onSite ? 'text-green-400' : 'text-muted')}
        >
          {distanceM === null
            ? 'Defina sua localização no mapa para reportar quebras.'
            : onSite
              ? `Você está no local (${formatDistance(distanceM)}).`
              : `Você está a ${formatDistance(distanceM)}. Reportar quebra exige estar a menos de ${FRAUD_RADIUS_M} m.`}
        </p>

        <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-md border border-line-strong">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              data-testid={`btn-report-${status}`}
              onClick={() => submitReport(station.id, status, 'report')}
              className="border-l border-line-strong px-2 py-2 text-center text-xs text-fg-2 first:border-l-0 hover:bg-surface-2"
            >
              {status === 'maintenance' ? 'Quebrado' : STATUS_LABEL[status]}
              {status !== runtime.status && (
                <span className="block text-[11px] text-faint tabular-nums" data-testid={`votes-${status}`}>
                  {pendingVotes(runtime.status, runtime.reports, status)}/{REPORTS_REQUIRED}
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          O status oficial muda com {REPORTS_REQUIRED} reportes de motoristas diferentes ou com um check-in no local.
        </p>

        <div className="mt-3 flex gap-2">
          <Button
            testId="btn-checkin"
            variant="secondary"
            className="flex-1 text-xs"
            onClick={() => submitReport(station.id, runtime.status === 'maintenance' ? 'available' : 'maintenance', 'checkin')}
            title="Check-in presencial altera o status oficial imediatamente"
          >
            {runtime.status === 'maintenance' ? 'Check-in: funcionando' : 'Check-in: quebrado'}
          </Button>
          <Button testId="btn-simulate-presence" variant="ghost" className="text-xs" onClick={() => simulatePresenceAt(station.id)}>
            Simular presença
          </Button>
        </div>

        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer text-muted hover:text-fg">Simular reportes de outros motoristas</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUSES.filter((s) => s !== runtime.status).map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`btn-sim-report-${s}`}
                onClick={() => simulateOtherDriverReport(station.id, s)}
                className="rounded border border-line-strong px-2 py-1 hover:bg-surface-2"
              >
                + {STATUS_LABEL[s].toLowerCase()}
              </button>
            ))}
          </div>
        </details>
      </Section>
    </div>
  );
}
