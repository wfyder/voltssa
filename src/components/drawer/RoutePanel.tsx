import { VEHICLE_BY_ID } from '../../data/salvadorStations';
import { isOpenAt } from '../../lib/hours';
import { formatDuration, formatKwh } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import type { Station } from '../../types';
import { Button, Notice, Section, Stat } from '../ui';
import { ElevationChart } from './ElevationChart';
import { ManeuverIcon } from '../navigation/ManeuverIcon';
import { spokenDistance } from '../../lib/navigation';

export function RoutePanel({ station }: { station: Station }) {
  const userLocation = useAppStore((s) => s.userLocation);
  const routeState = useAppStore((s) => s.routeState);
  const traceRoute = useAppStore((s) => s.traceRoute);
  const clearRoute = useAppStore((s) => s.clearRoute);
  const setPickingLocation = useAppStore((s) => s.setPickingLocation);
  const startNavigation = useAppStore((s) => s.startNavigation);
  const vehicleId = useAppStore((s) => s.vehicleId);
  const batteryPct = useAppStore((s) => s.batteryPct);
  const simHour = useAppStore((s) => s.simHour);
  const vehicle = VEHICLE_BY_ID[vehicleId];

  const mine = 'stationId' in routeState && routeState.stationId === station.id;
  const loading = mine && routeState.status === 'loading';
  const route = mine && routeState.status === 'ready' ? routeState.route : null;
  const error = mine && routeState.status === 'error' ? routeState.message : null;
  const open = isOpenAt(station.hours, simHour);

  const availableKwh = (vehicle.batteryKwh * batteryPct) / 100;
  const arrivalPct = route ? ((availableKwh - route.energy.realKwh) / vehicle.batteryKwh) * 100 : null;
  const reachable = arrivalPct !== null && arrivalPct > 0;

  return (
    <div data-testid="route-panel">
      <Section title="Rota até o posto">
        {!userLocation ? (
          <>
            <p className="mb-3 text-sm text-muted">Defina sua localização no mapa para calcular a rota.</p>
            <Button testId="btn-route-pick-location" variant="secondary" onClick={() => setPickingLocation(true)} className="w-full">
              Definir localização
            </Button>
          </>
        ) : (
          <div className="flex gap-2">
            <Button
              testId="btn-trace-route"
              onClick={() => traceRoute(station.id)}
              disabled={loading || !open}
              title={!open ? `Fechado (${station.hoursLabel})` : undefined}
              className="flex-1"
            >
              {loading ? 'Calculando…' : route ? 'Recalcular rota' : 'Traçar rota'}
            </Button>
            {route && (
              <Button testId="btn-clear-route" variant="secondary" onClick={clearRoute}>
                Limpar
              </Button>
            )}
          </div>
        )}
        {!open && (
          <div className="mt-3">
            <Notice tone="amber" testId="route-closed-warning">
              Rota indisponível: o posto está fechado nesse horário ({station.hoursLabel}).
            </Notice>
          </div>
        )}
        {error && (
          <div className="mt-3">
            <Notice tone="red" testId="route-error">
              {error}
            </Notice>
          </div>
        )}
      </Section>

      {route && (
        <>
          <Section title="Navegação">
            <div className="flex gap-2">
              <Button testId="btn-start-navigation" onClick={() => startNavigation('simulated')} className="flex-1">
                Iniciar navegação
              </Button>
              <Button
                testId="btn-start-navigation-gps"
                variant="secondary"
                onClick={() => startNavigation('gps')}
                title="Usa o GPS do aparelho (precisa estar em Salvador)"
              >
                Usar meu GPS
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Passo a passo com voz, câmera seguindo o carro e recálculo automático se você sair da rota. A navegação simulada
              percorre a rota sozinha; a de GPS acompanha sua posição real.
            </p>
          </Section>

          <Section title="Resumo">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Distância" value={`${route.distanceKm.toFixed(1)} km`} testId="route-distance" />
              <Stat label="Tempo" value={formatDuration(route.durationMin)} testId="route-duration" />
              <Stat
                label="Bateria na chegada"
                value={`${Math.max(0, arrivalPct ?? 0).toFixed(0)}%`}
                testId="route-arrival-battery"
                tone={reachable ? undefined : 'text-red-400'}
              />
            </div>
          </Section>

          <Section
            title="Perfil de elevação"
            right={
              <span className="text-xs text-faint">
                {route.elevationSource === 'terrarium' ? 'AWS Terrarium' : 'modelo offline'}
                {route.routingSource === 'fallback' && ', rota aproximada'}
              </span>
            }
          >
            <ElevationChart profile={route.profile} />
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
              <span>Subida total: {route.energy.ascentM.toFixed(0)} m</span>
              <span>Descida total: {route.energy.descentM.toFixed(0)} m</span>
              <span>
                Altitude: {route.energy.minElevationM.toFixed(0)} a {route.energy.maxElevationM.toFixed(0)} m
              </span>
              <span>Rampa máxima: {route.energy.maxGradePct.toFixed(1)}%</span>
            </div>
          </Section>

          <Section title="Consumo">
            <table className="w-full text-sm" data-testid="route-consumption">
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-2 text-fg-2">Em pista plana</td>
                  <td className="py-2 text-right tabular-nums" data-testid="route-flat-kwh">
                    {formatKwh(route.energy.flatKwh)}
                  </td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 text-fg-2">Subidas</td>
                  <td className="py-2 text-right tabular-nums">+{formatKwh(route.energy.climbKwh)}</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 text-fg-2">Regeneração nas descidas</td>
                  <td className="py-2 text-right tabular-nums">−{formatKwh(route.energy.regenKwh)}</td>
                </tr>
                <tr>
                  <td className="pt-3 font-medium text-fg">Consumo com relevo</td>
                  <td className="pt-3 text-right font-semibold tabular-nums" data-testid="route-real-kwh">
                    {formatKwh(route.energy.realKwh)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted" data-testid="route-delta">
              {route.energy.deltaPct >= 0
                ? `O relevo aumenta o consumo em ${route.energy.deltaPct.toFixed(1)}% em relação à pista plana.`
                : `As descidas reduzem o consumo em ${Math.abs(route.energy.deltaPct).toFixed(1)}% graças à regeneração.`}
            </p>
            {!reachable && (
              <div className="mt-3">
                <Notice tone="red" testId="route-unreachable">
                  A bateria não é suficiente para chegar a este posto.
                </Notice>
              </div>
            )}
          </Section>
          <Section title={`Passo a passo · ${route.steps.length} etapas`}>
            <ol className="divide-y divide-line" data-testid="route-steps">
              {route.steps.map((step, i) => (
                <li key={i} data-testid={`route-step-${i}`} className="flex gap-3 py-2 text-sm">
                  <ManeuverIcon step={step} className="mt-0.5 h-4 w-4 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="text-fg-2">{step.instruction}</div>
                  </div>
                  {step.distanceM > 0 && (
                    <span className="shrink-0 text-xs text-muted tabular-nums">{spokenDistance(step.distanceM)}</span>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        </>
      )}
    </div>
  );
}
