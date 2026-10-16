import { STATION_BY_ID } from '../../data/salvadorStations';
import { FRAUD_RADIUS_M } from '../../lib/geo';
import { formatDistance } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui';

export function FraudAlertModal() {
  const alert = useAppStore((s) => s.fraudAlert);
  const dismiss = useAppStore((s) => s.dismissFraudAlert);
  const simulatePresenceAt = useAppStore((s) => s.simulatePresenceAt);
  if (!alert) return null;
  const station = STATION_BY_ID[alert.stationId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fraud-title"
        data-testid="fraud-alert-modal"
        className="w-full max-w-sm rounded-md bg-surface p-5 shadow-xl"
      >
        <h2 id="fraud-title" className="text-base font-semibold text-fg">
          Fraude de Geolocalização Detectada
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted" data-testid="fraud-alert-message">
          {alert.message}
        </p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Posto</dt>
            <dd className="text-fg">{station.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Sua distância</dt>
            <dd className="text-red-400 tabular-nums" data-testid="fraud-alert-distance">
              {alert.distanceM === null ? 'sem localização' : formatDistance(alert.distanceM)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Limite</dt>
            <dd className="text-fg tabular-nums">{FRAUD_RADIUS_M} m</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">O reporte foi descartado e registrado no log de QA.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            testId="btn-fraud-simulate-presence"
            variant="ghost"
            onClick={() => {
              simulatePresenceAt(alert.stationId);
              dismiss();
            }}
          >
            Simular presença
          </Button>
          <Button testId="btn-fraud-dismiss" onClick={dismiss}>
            Entendi
          </Button>
        </div>
      </div>
    </div>
  );
}
