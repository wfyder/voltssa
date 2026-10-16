import { List, LocateFixed, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { STATION_BY_ID } from '../../data/salvadorStations';
import { useNavProgress } from '../../hooks/useNavProgress';
import { spokenDistance } from '../../lib/navigation';
import { cn, formatClock, formatDuration } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui';
import { ManeuverIcon } from './ManeuverIcon';

const SPEEDS = [1, 4, 10];

function IconButton({
  testId,
  label,
  onClick,
  active,
  children,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm transition-colors max-md:h-11 max-md:min-w-11',
        active ? 'bg-accent text-accent-fg' : 'text-fg-2 hover:bg-surface-3',
      )}
    >
      {children}
    </button>
  );
}

export function NavigationOverlay() {
  const navigation = useAppStore((s) => s.navigation);
  const routeState = useAppStore((s) => s.routeState);
  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const setNavPaused = useAppStore((s) => s.setNavPaused);
  const setNavSpeed = useAppStore((s) => s.setNavSpeed);
  const setNavFollow = useAppStore((s) => s.setNavFollow);
  const setNavVoice = useAppStore((s) => s.setNavVoice);
  const simulateDetour = useAppStore((s) => s.simulateDetour);
  const progress = useNavProgress();
  const [showSteps, setShowSteps] = useState(false);

  if (!navigation || !progress || routeState.status !== 'ready') return null;
  const { route } = routeState;
  const station = STATION_BY_ID[navigation.stationId];
  const next = progress.next;
  const after = route.steps[progress.stepIndex + 2];
  const current = route.steps[progress.stepIndex];
  const simulated = navigation.mode === 'simulated';

  if (navigation.arrived) {
    return (
      <div className="absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
        <div data-testid="nav-arrived" className="w-full max-w-md rounded-md border border-line bg-surface p-5 shadow-xl">
          <div className="text-xs text-muted">Destino</div>
          <h2 className="text-lg font-semibold text-fg">Você chegou a {station.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Bateria na chegada: <span className="text-fg tabular-nums">{Math.max(0, progress.batteryArrivalPct).toFixed(0)}%</span>
            {navigation.reroutes > 0 && ` · ${navigation.reroutes} recálculo${navigation.reroutes > 1 ? 's' : ''} de rota`}
          </p>
          <div className="mt-4 flex gap-2">
            <Button testId="btn-nav-arrived-queue" onClick={() => stopNavigation('queue')} className="flex-1">
              Ver fila e reservar
            </Button>
            <Button testId="btn-nav-arrived-close" variant="secondary" onClick={() => stopNavigation('overview')}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Next maneuver */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3 md:px-4">
        <div data-testid="nav-maneuver" className="pointer-events-auto w-full max-w-md overflow-hidden rounded-md border border-line bg-surface shadow-xl">
          <div className="flex items-center gap-4 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
              {next ? <ManeuverIcon step={next} className="h-8 w-8" /> : <ManeuverIcon step={{ type: 'arrive', modifier: null }} className="h-8 w-8" />}
            </div>
            <div className="min-w-0">
              <div data-testid="nav-distance-to-next" className="text-2xl font-semibold text-fg tabular-nums">
                {spokenDistance(progress.distanceToNextM)}
              </div>
              <div data-testid="nav-next-instruction" className="text-sm leading-snug text-fg-2">
                {next ? next.instruction : `Você chegou a ${station.name}`}
              </div>
            </div>
          </div>
          {current?.name && (
            <div className="border-t border-line px-4 py-1.5 text-xs text-fg-2 md:hidden">Você está na {current.name}</div>
          )}
          {after && (
            <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted" data-testid="nav-then">
              <span>Depois</span>
              <ManeuverIcon step={after} className="h-3.5 w-3.5" />
              <span className="truncate">{after.instruction}</span>
            </div>
          )}
          {navigation.rerouting && (
            <div className="border-t border-line px-4 py-2 text-xs text-accent" data-testid="nav-rerouting">
              Recalculando a rota…
            </div>
          )}
          {navigation.gpsError && (
            <div className="border-t border-line px-4 py-2 text-xs text-red-400" data-testid="nav-gps-error">
              GPS: {navigation.gpsError}
            </div>
          )}
        </div>
      </div>

      {/* Current street */}
      {current?.name && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[92px] z-30 flex justify-center max-md:hidden">
          <div data-testid="nav-current-street" className="rounded-md bg-surface/90 px-3 py-1 text-sm text-fg-2 shadow">
            {current.name}
          </div>
        </div>
      )}

      {/* Steps list */}
      {showSteps && (
        <div
          data-testid="nav-steps"
          className="ev-scroll absolute top-3 bottom-24 left-3 z-30 w-[300px] overflow-y-auto max-md:right-3 max-md:bottom-44 max-md:w-auto rounded-md border border-line bg-surface shadow-xl"
        >
          <div className="sticky top-0 border-b border-line bg-surface px-4 py-3 text-sm font-medium text-fg">Passo a passo</div>
          <ol>
            {route.steps.map((step, i) => {
              const done = i <= progress.stepIndex && step.type !== 'arrive';
              const isNext = i === progress.stepIndex + 1;
              return (
                <li
                  key={i}
                  data-testid={`nav-step-${i}`}
                  data-state={done ? 'done' : isNext ? 'next' : 'pending'}
                  className={cn('flex gap-3 border-b border-line px-4 py-2.5 text-sm', done && 'opacity-40', isNext && 'bg-surface-2')}
                >
                  <ManeuverIcon step={step} className={cn('mt-0.5 h-4 w-4', isNext ? 'text-accent' : 'text-muted')} />
                  <div className="min-w-0">
                    <div className="text-fg-2">{step.instruction}</div>
                    {step.distanceM > 0 && <div className="text-xs text-muted tabular-nums">{spokenDistance(step.distanceM)}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Trip summary and controls */}
      <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-3 md:px-4">
        <div data-testid="nav-bar" className="flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line bg-surface px-4 py-3 shadow-xl">
          <div className="flex items-baseline gap-5">
            <div>
              <div className="text-xs text-muted">Chegada</div>
              <div data-testid="nav-eta" className={cn('text-lg font-semibold tabular-nums', progress.arrivesAfterClose ? 'text-red-400' : 'text-fg')}>
                {formatClock(progress.etaMinuteOfDay)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Tempo</div>
              <div data-testid="nav-remaining-time" className="text-lg text-fg tabular-nums">
                {formatDuration(progress.remainingMin)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Distância</div>
              <div data-testid="nav-remaining-distance" className="text-lg text-fg tabular-nums">
                {progress.remainingKm.toFixed(1)} km
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Bateria</div>
              <div data-testid="nav-battery" className="text-lg text-fg tabular-nums">
                {progress.batteryNowPct.toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {simulated && (
              <>
                <IconButton
                  testId="btn-nav-pause"
                  label={navigation.paused ? 'Continuar' : 'Pausar'}
                  onClick={() => setNavPaused(!navigation.paused)}
                >
                  {navigation.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </IconButton>
                {SPEEDS.map((v) => (
                  <IconButton key={v} testId={`btn-nav-speed-${v}`} label={`Velocidade ${v}x`} active={navigation.speed === v} onClick={() => setNavSpeed(v)}>
                    <span className="text-xs tabular-nums">{v}x</span>
                  </IconButton>
                ))}
                <IconButton testId="btn-nav-detour" label="Simular desvio de rota" onClick={simulateDetour}>
                  <span className="text-xs">Desviar</span>
                </IconButton>
              </>
            )}
            <IconButton testId="btn-nav-voice" label={navigation.voice ? 'Desligar voz' : 'Ligar voz'} onClick={() => setNavVoice(!navigation.voice)}>
              {navigation.voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </IconButton>
            <IconButton testId="btn-nav-steps" label="Passo a passo" active={showSteps} onClick={() => setShowSteps((v) => !v)}>
              <List className="h-4 w-4" />
            </IconButton>
            {!navigation.follow && (
              <IconButton testId="btn-nav-recenter" label="Centralizar no carro" onClick={() => setNavFollow(true)}>
                <LocateFixed className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton testId="btn-nav-stop" label="Encerrar navegação" onClick={() => stopNavigation()}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          {progress.arrivesAfterClose && (
            <p className="w-full text-xs text-red-400" data-testid="nav-closing-warning">
              Você chega depois do fechamento ({station.hoursLabel}).
            </p>
          )}
          {progress.batteryArrivalPct <= 0 && (
            <p className="w-full text-xs text-red-400" data-testid="nav-battery-warning">
              A bateria pode acabar antes de chegar.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
