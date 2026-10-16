import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STATION_BY_ID, VEHICLE_BY_ID } from '../../data/salvadorStations';
import { isCompatible } from '../../lib/compatibility';
import { describeHours, isOpenAt } from '../../lib/hours';
import { cn } from '../../lib/utils';
import { displayStatus, useAppStore, type DrawerTab } from '../../store/useAppStore';
import { StatusLabel } from '../ui';
import { CostCalculator } from './CostCalculator';
import { IndoorMap } from './IndoorMap';
import { OverviewTab } from './OverviewTab';
import { QueuePanel } from './QueuePanel';
import { RoutePanel } from './RoutePanel';

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'overview', label: 'Detalhes' },
  { id: 'cost', label: 'Custo' },
  { id: 'queue', label: 'Fila' },
  { id: 'route', label: 'Rota' },
  { id: 'indoor', label: 'Subsolo' },
];

export function StationDrawer() {
  const selectedStationId = useAppStore((s) => s.selectedStationId);
  const selectStation = useAppStore((s) => s.selectStation);
  const drawerTab = useAppStore((s) => s.drawerTab);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const runtime = useAppStore((s) => (s.selectedStationId ? s.runtime[s.selectedStationId] : null));
  const vehicleId = useAppStore((s) => s.vehicleId);
  const simHour = useAppStore((s) => s.simHour);
  const openStationForm = useAppStore((s) => s.openStationForm);
  const removeStation = useAppStore((s) => s.removeStation);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => setConfirmRemove(false), [selectedStationId]);

  const station = selectedStationId ? STATION_BY_ID[selectedStationId] : null;
  const open = Boolean(station && runtime);
  const tabs = TABS.filter((t) => t.id !== 'indoor' || station?.hasIndoorMap);
  const activeTab = tabs.some((t) => t.id === drawerTab) ? drawerTab : 'overview';

  return (
    <aside
      data-testid="station-drawer"
      data-open={open}
      aria-hidden={!open}
      className={cn(
        'absolute top-0 right-0 bottom-0 z-20 flex w-[400px] max-w-full flex-col border-l border-line bg-surface transition-transform duration-300',
        // Phones: a bottom sheet over the map instead of a side panel.
        'mobile:fixed mobile:top-auto mobile:z-30 mobile:h-[82dvh] mobile:w-full mobile:rounded-t-xl mobile:border-t mobile:border-l-0 mobile:pr-[env(safe-area-inset-right)] mobile:pb-[env(safe-area-inset-bottom)] mobile:pl-[env(safe-area-inset-left)]',
        open
          ? 'translate-x-0 shadow-xl shadow-black/40 mobile:translate-y-0'
          : 'translate-x-full mobile:translate-x-0 mobile:translate-y-full',
      )}
    >
      {station && runtime && (
        <>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong desktop:hidden" />
          <div className="px-5 pt-4 mobile:pt-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-fg" data-testid="drawer-station-name">
                  {station.name}
                </h2>
                <p className="text-sm text-muted">{station.neighborhood}</p>
              </div>
              <button
                type="button"
                data-testid="btn-close-drawer"
                aria-label="Fechar detalhes"
                onClick={() => selectStation(null)}
                className="-mr-1.5 rounded p-1.5 text-faint hover:bg-surface-3 hover:text-fg mobile:p-2.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <StatusLabel status={displayStatus(runtime)} />
              <span data-testid="drawer-badge-hours" className={isOpenAt(station.hours, simHour) ? 'text-muted' : 'text-amber-400'}>
                {describeHours(station.hours, simHour)}
              </span>
              {!isCompatible(station, VEHICLE_BY_ID[vehicleId]) && (
                <span data-testid="drawer-badge-incompatible" className="text-red-400">
                  Incompatível com {VEHICLE_BY_ID[vehicleId].name}
                </span>
              )}
              {!runtime.ocppOnline && <span className="text-red-400">Sem comunicação (OCPP)</span>}
            </div>
            {station.source === 'user' && (
              <div data-testid="user-station-actions" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-accent">Adicionado por você · não verificado</span>
                <button
                  type="button"
                  data-testid="btn-edit-station"
                  onClick={() => openStationForm(station.id)}
                  className="text-muted underline hover:text-fg"
                >
                  editar
                </button>
                {confirmRemove ? (
                  <span className="flex items-center gap-2">
                    <span className="text-red-400">Remover este posto?</span>
                    <button
                      type="button"
                      data-testid="btn-confirm-remove-station"
                      onClick={() => removeStation(station.id)}
                      className="text-red-400 underline"
                    >
                      sim, remover
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(false)} className="text-muted underline">
                      não
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid="btn-remove-station"
                    onClick={() => setConfirmRemove(true)}
                    className="text-muted underline hover:text-red-400"
                  >
                    remover
                  </button>
                )}
              </div>
            )}
          </div>

          <nav className="ev-scroll mt-3 flex gap-5 overflow-x-auto border-b border-line px-5" role="tablist">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                data-testid={`drawer-tab-${id}`}
                onClick={() => setDrawerTab(id)}
                className={cn(
                  '-mb-px shrink-0 border-b-2 py-2 text-sm transition-colors mobile:py-3',
                  activeTab === id
                    ? 'border-accent text-fg'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ev-scroll flex-1 overflow-y-auto px-5 py-4">
            {activeTab === 'overview' && <OverviewTab station={station} runtime={runtime} />}
            {activeTab === 'cost' && <CostCalculator station={station} runtime={runtime} />}
            {activeTab === 'queue' && <QueuePanel station={station} runtime={runtime} />}
            {activeTab === 'route' && <RoutePanel station={station} />}
            {activeTab === 'indoor' && station.hasIndoorMap && <IndoorMap station={station} runtime={runtime} />}
          </div>
        </>
      )}
    </aside>
  );
}
