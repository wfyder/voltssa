import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PLUG_LABEL } from '../lib/compatibility';
import { nearestStation } from '../lib/geo';
import { describeHours } from '../lib/hours';
import { cn, formatBRL, formatDistance, formatDuration } from '../lib/utils';
import { useIsMobile } from '../hooks/useMediaQuery';
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
        className={cn('w-full px-4 py-3 text-left transition-colors', selected ? 'bg-surface-3' : 'hover:bg-surface-2')}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot status={status} />
            <span className={cn('truncate text-sm font-medium', block ? 'text-muted' : 'text-fg')}>{station.name}</span>
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

/** Search, quick filters and the sorted station list — shared by the desktop sidebar and the mobile sheet. */
function StationBrowser({ mobile, onSearchFocus, onSelect }: { mobile?: boolean; onSearchFocus?: () => void; onSelect?: () => void }) {
  const filters = useAppStore((s) => s.filters);
  const setFilter = useAppStore((s) => s.setFilter);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const sortBy = useAppStore((s) => s.sortBy);
  const setSortBy = useAppStore((s) => s.setSortBy);
  const selectedStationId = useAppStore((s) => s.selectedStationId);
  const selectStation = useAppStore((s) => s.selectStation);
  const userLocation = useAppStore((s) => s.userLocation);
  const locationSource = useAppStore((s) => s.locationSource);
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

  const pick = (id: string) => {
    selectStation(id);
    onSelect?.();
  };

  return (
    <>
      <div className={cn('space-y-3 border-b border-line', mobile ? 'px-4 pt-1 pb-3' : 'p-4')}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg">
            Eletropostos <span className="font-normal text-muted tabular-nums">· {visible.length}</span>
          </span>
          <button
            type="button"
            data-testid="btn-add-station"
            onClick={() => openStationForm()}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-accent hover:bg-surface-3"
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
            onFocus={onSearchFocus}
            onChange={(e) => setFilter('search', e.target.value)}
            className={cn(
              'w-full rounded-md border border-line-strong pr-3 pl-8 text-fg placeholder:text-faint focus:border-accent focus:outline-none',
              // 16px on phones keeps iOS from zooming into the field.
              mobile ? 'py-2 text-base' : 'py-1.5 text-sm',
            )}
          />
        </div>
        <div className={cn('flex gap-1.5', mobile ? 'ev-scroll -mx-4 overflow-x-auto px-4 pb-1' : 'flex-wrap')}>
          {(
            [
              ['type2', 'filter-type2', 'Tipo 2'],
              ['ccs2', 'filter-ccs2', 'CCS2'],
              ['free', 'filter-free', 'Gratuitos'],
              ['dcFast', 'filter-dc-fast', 'Rápida DC'],
              ['acSlow', 'filter-ac-slow', 'AC até 22 kW'],
              ['openNow', 'filter-open-now', 'Abertos agora'],
              ['compatibleOnly', 'filter-compatible', 'Compatíveis'],
            ] as const
          ).map(([key, testId, label]) => (
            <span key={key} className="shrink-0">
              <Chip testId={testId} active={filters[key]} onClick={() => setFilter(key, !filters[key])}>
                {label}
              </Chip>
            </span>
          ))}
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
        {!mobile && (
          <p className="text-xs leading-relaxed text-muted">
            Custo para carregar de {batteryPct}% a {Math.max(80, Math.min(100, batteryPct + 20))}%, incluindo estacionamento.
            Distância a partir {userLocation ? (locationSource === 'gps' ? 'da sua localização atual' : 'do ponto marcado') : 'do centro'}.
          </p>
        )}
        {nearest && (
          <button
            type="button"
            data-testid="btn-nearest-station"
            onClick={() => pick(nearest.station.id)}
            className="w-full text-left text-xs text-fg-2 hover:text-fg"
          >
            Mais próximo disponível: <span className="font-medium underline">{nearest.station.name}</span>,{' '}
            {formatDistance(nearest.distanceM)}
          </button>
        )}
      </div>

      <ul data-testid="station-list" className="ev-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.map((v) => (
          <StationListItem
            key={v.station.id}
            view={v}
            selected={v.station.id === selectedStationId}
            onSelect={() => pick(v.station.id)}
          />
        ))}
        {visible.length === 0 && (
          <li data-testid="empty-list" className="px-4 py-10 text-center text-sm text-muted">
            Nenhum posto corresponde aos filtros.
          </li>
        )}
      </ul>
    </>
  );
}

type SheetSnap = 'peek' | 'half' | 'full';
const SNAP_HEIGHT: Record<SheetSnap, string> = { peek: '128px', half: '52dvh', full: '88dvh' };
const NEXT_SNAP: Record<SheetSnap, SheetSnap> = { peek: 'half', half: 'full', full: 'peek' };

/** Phones: the list lives in a bottom sheet with three heights (tap the handle to cycle). */
function MobileStationSheet() {
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const selectedStationId = useAppStore((s) => s.selectedStationId);

  // Opening a station shows its details sheet; tuck the list away.
  useEffect(() => {
    if (selectedStationId) setSnap('peek');
  }, [selectedStationId]);

  return (
    <section
      data-testid="mobile-station-sheet"
      data-snap={snap}
      style={{ height: `calc(${SNAP_HEIGHT[snap]} + env(safe-area-inset-bottom))` }}
      className="fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] transition-[height] duration-300"
    >
      <button
        type="button"
        data-testid="btn-sheet-handle"
        aria-label={snap === 'full' ? 'Recolher lista' : 'Expandir lista'}
        onClick={() => setSnap(NEXT_SNAP[snap])}
        className="flex h-6 w-full shrink-0 items-center justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </button>
      <StationBrowser mobile onSearchFocus={() => setSnap('full')} onSelect={() => setSnap('peek')} />
    </section>
  );
}

export function Sidebar() {
  const isMobile = useIsMobile();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  if (isMobile) return <MobileStationSheet />;

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
        <StationBrowser />
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
