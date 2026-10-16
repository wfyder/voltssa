import { Loader2, LocateFixed, Navigation, Pause, Play, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { STATION_BY_ID, VEHICLE_BY_ID } from '../../data/salvadorStations';
import { useIsPortrait } from '../../hooks/useMediaQuery';
import { useNavProgress } from '../../hooks/useNavProgress';
import { useStationViews } from '../../hooks/useStationViews';
import { CAR_FILTER_LABEL, rankCarStations, type CarFilter } from '../../lib/carMode';
import { maxPowerKw, hasDcFast } from '../../lib/compatibility';
import { autonomyKm } from '../../lib/geo';
import { spokenDistance } from '../../lib/navigation';
import { cn, formatBRL, formatClock, formatDistance, formatDuration } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { SalvadorMap } from '../map/SalvadorMap';
import { carPanelWidth } from '../map/viewPadding';
import { ManeuverIcon } from '../navigation/ManeuverIcon';
import { NavigationController } from '../navigation/NavigationController';
import { StatusDot } from '../ui';

/* Large touch targets and no typing: the in-car rules CarPlay templates also follow. */

function BigButton({
  children,
  onClick,
  testId,
  variant = 'secondary',
  className,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  testId: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-accent-fg active:bg-accent-hover',
        variant === 'secondary' && 'bg-surface-3 text-fg active:bg-line-strong',
        variant === 'danger' && 'bg-red-500/15 text-red-300 active:bg-red-500/25',
        className,
      )}
    >
      {children}
    </button>
  );
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return formatClock(now.getHours() * 60 + now.getMinutes());
}

function StatusBar() {
  const vehicleId = useAppStore((s) => s.vehicleId);
  const batteryPct = useAppStore((s) => s.batteryPct);
  const locationSource = useAppStore((s) => s.locationSource);
  const setCarMode = useAppStore((s) => s.setCarMode);
  const navigating = useAppStore((s) => s.navigation !== null);
  const clock = useClock();
  const range = autonomyKm(VEHICLE_BY_ID[vehicleId], batteryPct);

  return (
    <div className="flex items-center gap-4 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
      <span className="text-2xl font-semibold tabular-nums">{clock}</span>
      <div className="min-w-0 flex-1 text-sm leading-tight text-muted">
        <div className="truncate text-fg-2">{VEHICLE_BY_ID[vehicleId].name}</div>
        <div className="tabular-nums" data-testid="car-battery">
          <span className={batteryPct <= 15 ? 'text-red-400' : 'text-fg'}>{batteryPct}%</span> · ~{range.toFixed(0)} km
          {locationSource === 'gps' && <span className="ml-2 text-accent">GPS</span>}
        </div>
      </div>
      {!navigating && (
        <button
          type="button"
          data-testid="btn-exit-car-mode"
          aria-label="Sair do modo carro"
          onClick={() => setCarMode(false)}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-3 text-fg-2"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function StationsPanel() {
  const { all } = useStationViews();
  const [filter, setFilter] = useState<CarFilter>('near');
  const userLocation = useAppStore((s) => s.userLocation);
  const locateMe = useAppStore((s) => s.locateMe);
  const locating = useAppStore((s) => s.locationStatus === 'locating');
  const locationNotice = useAppStore((s) => s.locationNotice);
  const quickNavigate = useAppStore((s) => s.quickNavigate);
  const routeState = useAppStore((s) => s.routeState);
  const rows = rankCarStations(all, filter);
  const loadingId = routeState.status === 'loading' ? routeState.stationId : null;
  const errorFor = routeState.status === 'error' ? routeState : null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 px-5" role="tablist">
        {(Object.keys(CAR_FILTER_LABEL) as CarFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            data-testid={`car-filter-${f}`}
            onClick={() => setFilter(f)}
            className={cn(
              'h-12 rounded-xl text-sm font-semibold',
              filter === f ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-fg-2',
            )}
          >
            {CAR_FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {!userLocation && (
        <div className="px-5 pt-3">
          <BigButton testId="car-btn-locate" variant="primary" onClick={() => void locateMe()} className="w-full" disabled={locating}>
            {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
            {locating ? 'Localizando…' : 'Usar minha localização'}
          </BigButton>
        </div>
      )}
      {locationNotice && <p className="px-5 pt-2 text-sm text-amber-300" data-testid="car-location-notice">{locationNotice}</p>}

      <ul className="ev-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3" data-testid="car-station-list">
        {rows.map((v) => {
          const busy = loadingId === v.station.id;
          return (
            <li key={v.station.id}>
              <button
                type="button"
                data-testid={`car-station-${v.station.id}`}
                onClick={() => void quickNavigate(v.station.id)}
                disabled={loadingId !== null}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-surface-3 disabled:opacity-60"
              >
                <StatusDot status={v.status} className="h-3 w-3" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-medium text-fg">{v.station.name}</div>
                  <div className="truncate text-sm text-muted tabular-nums">
                    {formatDistance(v.distanceM)} · {maxPowerKw(v.station)} kW {hasDcFast(v.station) ? 'DC' : 'AC'} ·{' '}
                    {v.estimate.total === 0 ? 'grátis' : formatBRL(v.estimate.total)}
                  </div>
                  {errorFor?.stationId === v.station.id && <div className="text-sm text-red-400">{errorFor.message}</div>}
                </div>
                <span className="flex h-12 min-w-16 items-center justify-center gap-1 rounded-xl bg-accent px-3 text-base font-semibold text-accent-fg">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-4 w-4" />}
                  Ir
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center text-base text-muted" data-testid="car-empty">
            Nenhum posto disponível agora para o seu carro.
          </li>
        )}
      </ul>
    </>
  );
}

function NavigationPanel() {
  const navigation = useAppStore((s) => s.navigation)!;
  const routeState = useAppStore((s) => s.routeState);
  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const setNavVoice = useAppStore((s) => s.setNavVoice);
  const setNavFollow = useAppStore((s) => s.setNavFollow);
  const setNavPaused = useAppStore((s) => s.setNavPaused);
  const setNavSpeed = useAppStore((s) => s.setNavSpeed);
  const progress = useNavProgress();
  if (!progress || routeState.status !== 'ready') return null;

  const station = STATION_BY_ID[navigation.stationId];
  const steps = routeState.route.steps;
  const next = progress.next;
  const after = steps[progress.stepIndex + 2];
  const current = steps[progress.stepIndex];

  if (navigation.arrived) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5" data-testid="car-arrived">
        <div className="rounded-xl bg-surface-2 p-5">
          <div className="text-sm text-muted">Você chegou</div>
          <div className="text-2xl font-semibold">{station.name}</div>
          <div className="mt-1 text-base text-fg-2 tabular-nums">
            Bateria: {Math.max(0, progress.batteryArrivalPct).toFixed(0)}%
          </div>
        </div>
        <BigButton testId="car-btn-finish" variant="primary" onClick={() => stopNavigation('queue')} className="w-full">
          Concluir
        </BigButton>
      </div>
    );
  }

  return (
    <div className="ev-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="car-navigation">
      <div className="rounded-xl bg-surface-2 p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <ManeuverIcon step={next ?? { type: 'arrive', modifier: null }} className="h-11 w-11" />
          </div>
          <div className="min-w-0">
            <div className="text-4xl font-semibold tabular-nums" data-testid="car-distance-to-next">
              {spokenDistance(progress.distanceToNextM)}
            </div>
            <div className="text-lg leading-snug text-fg-2" data-testid="car-next-instruction">
              {next ? next.instruction : `Você chegou a ${station.name}`}
            </div>
          </div>
        </div>
        {after && (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-base text-muted">
            <span>Depois</span>
            <ManeuverIcon step={after} className="h-5 w-5" />
            <span className="truncate">{after.instruction}</span>
          </div>
        )}
        {navigation.rerouting && <div className="mt-2 text-base text-accent">Recalculando a rota…</div>}
        {navigation.gpsError && <div className="mt-2 text-sm text-red-400">GPS: {navigation.gpsError}</div>}
      </div>

      {current?.name && <div className="truncate px-1 text-base text-fg-2">Na {current.name}</div>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
        <div>
          <div className="text-sm text-muted">Chegada</div>
          <div className={cn('text-2xl font-semibold tabular-nums', progress.arrivesAfterClose && 'text-red-400')} data-testid="car-eta">
            {formatClock(progress.etaMinuteOfDay)}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">Tempo</div>
          <div className="text-2xl tabular-nums">{formatDuration(progress.remainingMin)}</div>
        </div>
        <div>
          <div className="text-sm text-muted">Distância</div>
          <div className="text-2xl tabular-nums">{progress.remainingKm.toFixed(1)} km</div>
        </div>
        <div>
          <div className="text-sm text-muted">Bateria</div>
          <div className="text-2xl tabular-nums">{progress.batteryNowPct.toFixed(0)}%</div>
        </div>
      </div>
      {progress.arrivesAfterClose && <p className="px-1 text-sm text-red-400">Chegada depois do fechamento ({station.hoursLabel}).</p>}

      <div className="mt-auto grid grid-cols-3 gap-2">
        <BigButton
          testId="car-btn-voice"
          label={navigation.voice ? 'Desligar voz' : 'Ligar voz'}
          onClick={() => setNavVoice(!navigation.voice)}
        >
          {navigation.voice ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
        </BigButton>
        <BigButton testId="car-btn-recenter" label="Centralizar no carro" onClick={() => setNavFollow(true)} disabled={navigation.follow}>
          <LocateFixed className="h-6 w-6" />
        </BigButton>
        <BigButton testId="car-btn-stop" variant="danger" label="Encerrar navegação" onClick={() => stopNavigation()}>
          <X className="h-6 w-6" />
        </BigButton>
      </div>
      {navigation.mode === 'simulated' && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Simulação</span>
          <button
            type="button"
            data-testid="car-btn-pause"
            onClick={() => setNavPaused(!navigation.paused)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-3"
            aria-label={navigation.paused ? 'Continuar' : 'Pausar'}
          >
            {navigation.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          {[1, 4, 10].map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`car-btn-speed-${v}`}
              onClick={() => setNavSpeed(v)}
              className={cn('h-10 rounded-lg px-3 tabular-nums', navigation.speed === v ? 'bg-accent text-accent-fg' : 'bg-surface-3')}
            >
              {v}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Car mode: CarPlay-style layout for a phone on the dashboard or an in-car browser —
 * map on one side, a short list of usable stations or the turn-by-turn panel on the other.
 */
export function CarMode() {
  const portrait = useIsPortrait();
  const navigating = useAppStore((s) => s.navigation !== null);
  const locateMe = useAppStore((s) => s.locateMe);
  const locating = useAppStore((s) => s.locationStatus === 'locating');
  const [panelWidth, setPanelWidth] = useState(carPanelWidth);

  useEffect(() => {
    const onResize = () => setPanelWidth(carPanelWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-base text-fg" data-testid="car-mode" data-orientation={portrait ? 'portrait' : 'landscape'}>
      <SalvadorMap />
      <NavigationController />

      <aside
        data-testid="car-panel"
        style={portrait ? undefined : { width: panelWidth }}
        className={cn(
          'absolute z-20 flex flex-col bg-surface/95 backdrop-blur',
          portrait
            ? 'inset-x-0 bottom-0 h-[55dvh] rounded-t-2xl border-t border-line'
            : 'top-0 bottom-0 left-0 border-r border-line',
        )}
      >
        <StatusBar />
        {navigating ? <NavigationPanel /> : <StationsPanel />}
      </aside>

      {!navigating && (
        <div className={cn('absolute z-10 flex flex-col gap-3', portrait ? 'top-[max(1rem,env(safe-area-inset-top))] right-4' : 'right-5 bottom-5')}>
          <button
            type="button"
            data-testid="car-btn-gps"
            aria-label="Usar minha localização atual"
            onClick={() => void locateMe()}
            className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface text-fg shadow-xl shadow-black/50"
          >
            {locating ? <Loader2 className="h-7 w-7 animate-spin" /> : <LocateFixed className="h-7 w-7" />}
          </button>
        </div>
      )}

      <div
        className={cn(
          'pointer-events-none absolute top-4 right-5 z-10 flex items-center gap-2 rounded-lg bg-surface/90 px-3 py-1.5 text-sm text-muted max-[700px]:hidden',
          portrait && 'hidden',
        )}
      >
        <Zap className="h-4 w-4 text-accent" /> VoltSSA · Modo carro
      </div>
    </div>
  );
}
