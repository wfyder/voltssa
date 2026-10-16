import { memo } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import { cn } from '../../lib/utils';
import type { StationView } from '../../hooks/useStationViews';
import { STATUS_COLOR, STATUS_LABEL } from '../ui';

interface Props {
  view: StationView;
  selected: boolean;
  compact: boolean;
  onSelect: (id: string) => void;
}

function StationMarkerBase({ view, selected, compact, onSelect }: Props) {
  const { station, status, compatible, open, runtime } = view;
  const color = STATUS_COLOR[status];
  const dimmed = !compatible || !open || !runtime.ocppOnline;
  const isDcStation = station.connectors.some((c) => c.type === 'CCS2_DC');
  const size = compact ? 16 : 24;

  return (
    <Marker
      longitude={station.coords.lng}
      latitude={station.coords.lat}
      anchor="bottom"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onSelect(station.id);
      }}
      style={{ zIndex: selected ? 20 : 5 }}
    >
      <button
        type="button"
        data-testid={`station-marker-${station.id}`}
        data-status={status}
        data-compatible={compatible}
        data-open={open}
        aria-label={`${station.name} — ${STATUS_LABEL[status]}`}
        title={`${station.name} · ${STATUS_LABEL[status]}`}
        className={cn(
          'relative block cursor-pointer transition-transform duration-150 hover:-translate-y-0.5',
          selected && 'ev-marker-selected',
          dimmed && !selected && 'opacity-50',
        )}
      >
        <svg
          width={selected ? size * 1.3 : size}
          height={(selected ? size * 1.3 : size) * 1.25}
          viewBox="0 0 24 30"
          data-testid={`station-pin-svg-${station.id}`}
          className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
        >
          {/* DC stations: squared head; AC stations: round head. */}
          {isDcStation ? (
            <path d="M5 2h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-4.2L12 28l-2.8-8H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" fill={color} stroke={selected ? '#facc15' : '#0e0e0e'} strokeWidth={selected ? 2 : 1.4} />
          ) : (
            <path d="M12 29s-9.5-9.2-9.5-16.5a9.5 9.5 0 0 1 19 0C21.5 19.8 12 29 12 29Z" fill={color} stroke={selected ? '#facc15' : '#0e0e0e'} strokeWidth={selected ? 2 : 1.4} />
          )}
          {status === 'maintenance' ? (
            <path d="M9 8.5l6 6M15 8.5l-6 6" stroke="#0e0e0e" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <circle cx="12" cy={isDcStation ? 11 : 12} r="3" fill="#0e0e0e" />
          )}
        </svg>
        {!compatible && !compact && (
          <span data-testid={`station-marker-incompatible-${station.id}`} className="sr-only">
            Incompatível
          </span>
        )}
      </button>
    </Marker>
  );
}

export const StationMarker = memo(StationMarkerBase);
