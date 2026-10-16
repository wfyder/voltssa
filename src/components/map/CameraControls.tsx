import { Crosshair, Moon, RotateCw, Sun, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { FLY_TO_REGIONS } from '../../data/cityZones';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { mapHandle } from './mapSetup';

const COMERCIO = { lat: -12.9718, lng: -38.5128 };

function ToolButton({
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
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded px-2.5 text-xs whitespace-nowrap transition-colors',
        active ? 'bg-accent text-accent-fg' : 'text-fg-2 hover:bg-surface-3',
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-surface-3" />;

export function CameraControls() {
  const pickingLocation = useAppStore((s) => s.pickingLocation);
  const setPickingLocation = useAppStore((s) => s.setPickingLocation);
  const userLocation = useAppStore((s) => s.userLocation);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const nightMap = useAppStore((s) => s.nightMap);
  const setNightMap = useAppStore((s) => s.setNightMap);

  const ease = (opts: { pitch?: number; bearing?: number }) => mapHandle.current?.easeTo({ ...opts, duration: 800 });

  return (
    <div
      data-testid="camera-controls"
      className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-md border border-line bg-surface p-1 shadow-sm"
    >
      <ToolButton
        testId="btn-set-location"
        label="Definir minha localização"
        active={pickingLocation}
        onClick={() => setPickingLocation(!pickingLocation)}
      >
        <Crosshair className="h-3.5 w-3.5" /> {pickingLocation ? 'Clique no mapa' : 'Minha localização'}
      </ToolButton>
      <ToolButton
        testId="btn-location-comercio"
        label="Posicionar no Comércio (Cidade Baixa)"
        onClick={() => {
          setUserLocation(COMERCIO);
          mapHandle.current?.flyTo({ center: [COMERCIO.lng, COMERCIO.lat], zoom: 14.5, duration: 1200 });
        }}
      >
        Estou no Comércio
      </ToolButton>
      {userLocation && (
        <>
          <ToolButton
            testId="btn-center-location"
            label="Centralizar em mim"
            onClick={() => mapHandle.current?.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14.5, duration: 1000 })}
          >
            Centralizar
          </ToolButton>
          <ToolButton testId="btn-clear-location" label="Remover localização" onClick={() => setUserLocation(null)}>
            <X className="h-3.5 w-3.5" />
          </ToolButton>
        </>
      )}

      <Divider />

      <ToolButton testId="btn-camera-tilt" label="Inclinar câmera 60°" onClick={() => ease({ pitch: 60 })}>
        3D
      </ToolButton>
      <ToolButton testId="btn-camera-top" label="Visão de topo 0°" onClick={() => ease({ pitch: 0, bearing: 0 })}>
        Topo
      </ToolButton>
      <ToolButton
        testId="btn-camera-rotate"
        label="Girar câmera 45°"
        onClick={() => ease({ bearing: (mapHandle.current?.getBearing() ?? 0) + 45 })}
      >
        <RotateCw className="h-3.5 w-3.5" />
      </ToolButton>

      <Divider />

      {FLY_TO_REGIONS.map((r) => (
        <ToolButton
          key={r.id}
          testId={`btn-flyto-${r.id}`}
          label={`Voar para ${r.label}`}
          onClick={() =>
            mapHandle.current?.flyTo({
              center: [r.coords.lng, r.coords.lat],
              zoom: r.zoom,
              pitch: 60,
              bearing: -20,
              duration: 2400,
              essential: true,
            })
          }
        >
          {r.label}
        </ToolButton>
      ))}

      <Divider />

      <ToolButton testId="btn-toggle-night-map" label={nightMap ? 'Mapa claro' : 'Mapa escuro'} onClick={() => setNightMap(!nightMap)}>
        {nightMap ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </ToolButton>
    </div>
  );
}
