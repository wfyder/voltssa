import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useMemo } from 'react';
import { PLUG_LABEL } from '../lib/compatibility';
import { nearestStation } from '../lib/geo';
import { describeHours } from '../lib/hours';
import { cn, formatBRL, formatDistance, formatDuration } from '../lib/utils';
import { useStationViews, type StationView } from '../hooks/useStationViews';
import { BLOCK_REASON_LABEL, EMPTY_FILTERS, useAppStore, type SortKey } from '../store/useAppStore';
import { Chip, Select, StatusDot } from './ui';

const SORT_LABEL: Record<SortKey, string> = {
  distance: 'Distância',
  cost: 'Custo real',
  reliability: 'Confiabilidade',
};

function StationListItem({ view, selected, onSelect }: { view: StationView; selected: boolean; onSelect: () => void }) {
  const { station, status, compatible, open, estimate, block, runtime, distanceM } = view;
  const simHour = useAppStore((s) => s.simHour);
  const plugs = [...new Set(station.connectors.map((c) => PLUG_LABEL[c.type]))].join(', ');

  return (
    <li className="border-b border-line">
      <button
        type="button"
        data-testid={`station-list-item-${station.id}`}
        data-blocked={block !== null}
        onClick={onSelect}
        className={cn(
          'w-full px-4 py-3 text-left transition-colors',
          selected ? 'bg-surface-3' : 'hover:bg-surface-2',
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot status={status} />
            <span className={cn('truncate text-sm font-medium', block ? 'text-muted' : 'text-fg')}>
              {station.name}
            </span>
          </div>
          <span data-testid={`list-cost-${station.id}`} className="shrink-0 text-sm text-fg tabular-nums">
            {estimate.restricted ? '—' : formatBRL(estimate.total)}
          </span>
        </div>
        <div className="mt-0.5 flex justify-between gap-3 pl-4 text-xs text-muted">
          <span className="truncate">
            {station.neighborhood} · {formatDistance(distanceM)}
          </span>
          <span className="shrink-0 tabular-nums">{compatible && !estimate.restricted ? formatDuration(estimate.durationMin) : ''}</span>
        </div>
        <div className="mt-0.5 pl-4 text-xs text-muted">
          {plugs} · {station.powerLabel} · confiabilidade {runtime.reliability}%
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 pl-4 text-xs">
          {station.source === 'user' && (
            <span data-testid={`badge-user-station-${station.id}`} className="text-accent">
              adicionado por você
            </span>
          )}
          {!compatible && (
            <span data-testid={`badge-incompatible-${station.id}`} className="text-red-400">
              Incompatível
            </span>
          )}
          {!open && (
            <span data-testid={`badge-closed-${station.id}`} className="text-amber-400">
              {describeHours(station.hours, simHour)}
            </span>
          )}
          {block && block !== 'incompatible' && block !== 'closed' && <span className="text-red-400">{BLOCK_REASON_LABEL[block]}</span>}
        </div>
      </button>
    </li>
  );
}

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const filters = useAppStore((s) => s.filters);
  const setFilter = useAppStore((s) => s.setFilter);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const sortBy = useAppStore((s) => s.sortBy);
  const setSortBy = useAppStore((s) => s.setSortBy);
  const selectedStationId = useAppStore((s) => s.selectedStationId);
  const selectStation = useAppStore((s) => s.selectStation);
  const userLocation = useAppStore((s) => s.userLocation);
  const batteryPct = useAppStore((s) => s.batteryPct);
  const openStationForm = useAppStore((s) => s.openStationForm);
  const { all, visible } = useStationViews();

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const nearest = useMemo(() => {
    if (!userLocation) return null;
    return nearestStation(
      userLocation,
      all.filter((v) => v.block === null).map((v) => v.station),
    );
  }, [all, userLocation]);

  return (
    <aside
      data-testid="sidebar"
      data-open={sidebarOpen}
      className={cn(
        'absolute top-0 bottom-0 left-0 z-20 flex transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-[320px]',
      )}
    >
      <div className="flex w-[320px] flex-col border-r border-line bg-surface">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fg">Eletropostos</span>
            <button
              type="button"
              data-testid="btn-add-station"
              onClick={() => openStationForm()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-accent hover:bg-surface-3"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar posto
            </button>
          </div>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              data-testid="input-search"
              type="search"
              placeholder="Buscar posto ou bairro"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              className="w-full rounded-md border border-line-strong py-1.5 pr-3 pl-8 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip testId="filter-type2" active={filters.type2} onClick={() => setFilter('type2', !filters.type2)}>
              Tipo 2
            </Chip>
            <Chip testId="filter-ccs2" active={filters.ccs2} onClick={() => setFilter('ccs2', !filters.ccs2)}>
              CCS2
            </Chip>
            <Chip testId="filter-free" active={filters.free} onClick={() => setFilter('free', !filters.free)}>
              Gratuitos
            </Chip>
            <Chip testId="filter-dc-fast" active={filters.dcFast} onClick={() => setFilter('dcFast', !filters.dcFast)}>
              Rápida DC
            </Chip>
            <Chip testId="filter-ac-slow" active={filters.acSlow} onClick={() => setFilter('acSlow', !filters.acSlow)}>
              AC até 22 kW
            </Chip>
            <Chip testId="filter-open-now" active={filters.openNow} onClick={() => setFilter('openNow', !filters.openNow)}>
              Abertos agora
            </Chip>
            <Chip
              testId="filter-compatible"
              active={filters.compatibleOnly}
              onClick={() => setFilter('compatibleOnly', !filters.compatibleOnly)}
            >
              Compatíveis
            </Chip>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              <span data-testid="visible-count" className="text-fg tabular-nums">
                {visible.length}
              </span>{' '}
              de {all.length} postos
              {filtersActive && (
                <button type="button" data-testid="btn-reset-filters" onClick={resetFilters} className="ml-2 underline hover:text-fg">
                  limpar
                </button>
              )}
            </span>
            <Select testId="select-sort" label="Ordenar" value={sortBy} onChange={(v) => setSortBy(v as SortKey)} className="py-1 text-xs">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Custo para carregar de {batteryPct}% a {Math.max(80, Math.min(100, batteryPct + 20))}%, incluindo estacionamento.
            Distância a partir {userLocation ? 'da sua localização' : 'do centro'}.
          </p>
          {nearest && (
            <button
              type="button"
              data-testid="btn-nearest-station"
              onClick={() => selectStation(nearest.station.id)}
              className="w-full text-left text-xs text-fg-2 hover:text-fg"
            >
              Mais próximo disponível: <span className="font-medium underline">{nearest.station.name}</span>,{' '}
              {formatDistance(nearest.distanceM)}
            </button>
          )}
        </div>

        <ul data-testid="station-list" className="ev-scroll flex-1 overflow-y-auto">
          {visible.map((v) => (
            <StationListItem
              key={v.station.id}
              view={v}
              selected={v.station.id === selectedStationId}
              onSelect={() => selectStation(v.station.id)}
            />
          ))}
          {visible.length === 0 && (
            <li data-testid="empty-list" className="px-4 py-10 text-center text-sm text-muted">
              Nenhum posto corresponde aos filtros.
            </li>
          )}
        </ul>
      </div>

      <button
        type="button"
        data-testid="btn-toggle-sidebar"
        aria-label={sidebarOpen ? 'Recolher barra lateral' : 'Expandir barra lateral'}
        onClick={toggleSidebar}
        className="mt-3 flex h-9 w-5 items-center justify-center self-start rounded-r border border-l-0 border-line bg-surface text-muted hover:text-fg"
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </aside>
  );
}
