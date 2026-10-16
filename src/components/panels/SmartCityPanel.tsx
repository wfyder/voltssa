import { useMemo, useState } from 'react';
import { CHARGING_DESERTS, CORRIDOR_NEIGHBORHOODS } from '../../data/cityZones';
import { STATION_BY_ID, VEHICLE_BY_ID } from '../../data/salvadorStations';
import { hasDcFast, isDc, isFree, maxPowerKw } from '../../lib/compatibility';
import { nearestStation } from '../../lib/geo';
import { isOpenAt } from '../../lib/hours';
import { exportReport } from '../../lib/report';
import { formatDistance } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import type { Station } from '../../types';
import { Button, Section, Select, Stat } from '../ui';

const isPublicDc = (s: Station) => s.connectors.some((c) => isDc(c.type) && c.tariff.kind !== 'restricted');

export function SmartCityPanel() {
  const runtime = useAppStore((s) => s.runtime);
  const stations = useAppStore((s) => s.stations);
  const dcStations = useMemo(() => stations.filter(isPublicDc), [stations]);
  const simHour = useAppStore((s) => s.simHour);
  const selectedStationId = useAppStore((s) => s.selectedStationId);
  const dropRandomOcpp = useAppStore((s) => s.dropRandomOcpp);
  const restoreAllOcpp = useAppStore((s) => s.restoreAllOcpp);
  const toggleOcpp = useAppStore((s) => s.toggleOcpp);
  const togglePowerSplit = useAppStore((s) => s.togglePowerSplit);
  const selectStation = useAppStore((s) => s.selectStation);
  const [splitStationId, setSplitStationId] = useState(stations.filter(isPublicDc)[0].id);
  const [collapsed, setCollapsed] = useState(false);

  const kpis = useMemo(() => {
    const total = stations.length;
    const corridor = stations.filter((s) => CORRIDOR_NEIGHBORHOODS.includes(s.neighborhood)).length;
    const capacityKw = stations.reduce((sum, s) => sum + maxPowerKw(s) * s.slots, 0);
    const dcFast = stations.filter(hasDcFast).length;
    const openNow = stations.filter((s) => isOpenAt(s.hours, simHour)).length;
    const free = stations.filter(isFree).length;
    const avgReliability = stations.reduce((sum, s) => sum + runtime[s.id].reliability, 0) / total;
    const offline = stations.filter((s) => !runtime[s.id].ocppOnline).length;
    const broken = stations.filter((s) => runtime[s.id].status === 'maintenance').length;
    const deserts = CHARGING_DESERTS.map((d) => ({ ...d, nearest: nearestStation(d.coords, stations) }));
    return { total, corridor, capacityKw, dcFast, openNow, free, avgReliability, offline, broken, deserts };
  }, [stations, runtime, simHour]);

  const splitStation = STATION_BY_ID[splitStationId] ?? dcStations[0];
  const splitKw = splitStation.connectors.find((c) => isDc(c.type))!.powerKw;
  const splitActive = runtime[splitStation.id].powerSplit;
  const offlineStations = stations.filter((s) => !runtime[s.id].ocppOnline);

  const onExport = (format: 'md' | 'json') => {
    const s = useAppStore.getState();
    exportReport(
      {
        stations: s.stations,
        qaLog: s.qaLog,
        runtime: s.runtime,
        selfTests: s.selfTests,
        context: { vehicle: VEHICLE_BY_ID[s.vehicleId].name, batteryPct: s.batteryPct, simHour: s.simHour },
      },
      format,
    );
    s.logQa('selftest', 'info', `Relatório de testes exportado (${format.toUpperCase()})`);
  };

  return (
    <aside
      data-testid="smartcity-panel"
      style={{ right: selectedStationId ? 412 : 12 }}
      className="ev-scroll absolute top-3 bottom-16 z-20 w-[340px] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-md border border-line bg-surface px-4 py-4 shadow-sm transition-[right] duration-300"
    >
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-fg">Cobertura da cidade</h2>
          <p className="text-xs text-muted">Onde faltam pontos de recarga em Salvador</p>
        </div>
        <button
          type="button"
          data-testid="btn-collapse-smartcity"
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs text-muted underline hover:text-fg"
        >
          {collapsed ? 'mostrar' : 'ocultar'}
        </button>
      </header>

      {!collapsed && (
        <>
          <Section title="Indicadores">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="smartcity-kpis">
              <Stat
                label="Na Orla, Tancredo Neves e Paralela"
                value={`${Math.round((kpis.corridor / kpis.total) * 100)}%`}
                sub={`${kpis.corridor} de ${kpis.total} postos`}
                testId="kpi-corridor-concentration"
              />
              <Stat
                label="Capacidade instalada"
                value={`${(kpis.capacityKw / 1000).toFixed(2)} MW`}
                sub={`${kpis.dcFast} com carga rápida DC`}
                testId="kpi-capacity"
              />
              <Stat
                label={`Abertos às ${simHour}h`}
                value={`${kpis.openNow} de ${kpis.total}`}
                sub={`${kpis.free} com energia gratuita`}
                testId="kpi-open-now"
              />
              <Stat
                label="Confiabilidade média"
                value={`${kpis.avgReliability.toFixed(0)}%`}
                sub={`${kpis.broken} em manutenção, ${kpis.offline} sem comunicação`}
                testId="kpi-reliability"
              />
            </div>
          </Section>

          <Section title="Regiões sem cobertura">
            <ul className="divide-y divide-line">
              {kpis.deserts.map((d) => (
                <li key={d.id} data-testid={`desert-kpi-${d.id}`} className="py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-fg">{d.name}</span>
                    <span className="text-xs text-red-400 tabular-nums">{d.nearest ? formatDistance(d.nearest.distanceM) : '—'}</span>
                  </div>
                  {d.nearest && (
                    <button
                      type="button"
                      onClick={() => selectStation(d.nearest!.station.id)}
                      className="text-left text-xs text-muted hover:text-fg hover:underline"
                    >
                      Posto mais próximo: {d.nearest.station.name}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Testes de falha">
            <div className="space-y-5 text-sm">
              <div>
                <div className="mb-1 text-fg-2">Queda de comunicação OCPP</div>
                <div className="flex gap-2">
                  <Button testId="btn-chaos-ocpp-drop" variant="danger" onClick={() => dropRandomOcpp(3)} className="flex-1 text-xs">
                    Derrubar 3 postos
                  </Button>
                  <Button
                    testId="btn-chaos-ocpp-restore"
                    variant="secondary"
                    onClick={restoreAllOcpp}
                    disabled={offlineStations.length === 0}
                    className="flex-1 text-xs"
                  >
                    Restaurar
                  </Button>
                </div>
                {selectedStationId && (
                  <button
                    type="button"
                    data-testid="btn-chaos-ocpp-toggle-selected"
                    onClick={() => toggleOcpp(selectedStationId)}
                    className="mt-2 text-xs text-muted underline hover:text-fg"
                  >
                    {runtime[selectedStationId].ocppOnline ? 'Derrubar' : 'Restaurar'} {STATION_BY_ID[selectedStationId].name}
                  </button>
                )}
                {offlineStations.length > 0 && (
                  <p className="mt-2 text-xs text-red-400" data-testid="ocpp-offline-list">
                    Sem comunicação: {offlineStations.map((s) => s.name).join(', ')}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1 text-fg-2">Dois carros no mesmo carregador DC</div>
                <Select
                  testId="select-power-split-station"
                  value={splitStation.id}
                  onChange={setSplitStationId}
                  className="w-full text-xs"
                >
                  {dcStations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.connectors.find((c) => isDc(c.type))?.powerKw} kW)
                    </option>
                  ))}
                </Select>
                <div className="mt-2 flex h-6 overflow-hidden rounded-sm text-[11px] tabular-nums" data-testid="power-split-visual">
                  <div className="flex items-center justify-center bg-fg-2 text-accent-fg transition-all" style={{ width: splitActive ? '50%' : '100%' }}>
                    Carro A · {(splitActive ? splitKw / 2 : splitKw).toFixed(1)} kW
                  </div>
                  {splitActive && (
                    <div className="flex w-1/2 items-center justify-center border-l border-base bg-muted text-accent-fg">
                      Carro B · {(splitKw / 2).toFixed(1)} kW
                    </div>
                  )}
                </div>
                <Button
                  testId="btn-chaos-power-split"
                  variant="secondary"
                  onClick={() => togglePowerSplit(splitStation.id)}
                  className="mt-2 w-full text-xs"
                >
                  {splitActive ? 'Desconectar segundo carro' : 'Conectar segundo carro'}
                </Button>
              </div>

              <div>
                <div className="mb-1 text-fg-2">Relatório de testes</div>
                <div className="flex gap-2">
                  <Button testId="btn-export-report-md" variant="secondary" onClick={() => onExport('md')} className="flex-1 text-xs">
                    Baixar .md
                  </Button>
                  <Button testId="btn-export-report-json" variant="secondary" onClick={() => onExport('json')} className="flex-1 text-xs">
                    Baixar .json
                  </Button>
                </div>
              </div>
            </div>
          </Section>
        </>
      )}
    </aside>
  );
}
