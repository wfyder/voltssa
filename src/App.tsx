import { X } from 'lucide-react';
import { useEffect } from 'react';
import { CarMode } from './components/car/CarMode';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { StationDrawer } from './components/drawer/StationDrawer';
import { SalvadorMap } from './components/map/SalvadorMap';
import { NavigationController } from './components/navigation/NavigationController';
import { NavigationOverlay } from './components/navigation/NavigationOverlay';
import { FraudAlertModal } from './components/panels/FraudAlertModal';
import { StationFormModal } from './components/panels/StationFormModal';
import { QaPanel } from './components/panels/QaPanel';
import { SmartCityPanel } from './components/panels/SmartCityPanel';
import { StatusDot, STATUS_LABEL } from './components/ui';
import { useAppStore } from './store/useAppStore';
import type { StationStatus } from './types';

function Legend() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  return (
    <div
      data-testid="map-legend"
      className="absolute top-3 z-10 flex gap-4 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-[left] duration-300 max-md:hidden"
      style={{ left: sidebarOpen ? 352 : 32 }}
    >
      {(Object.keys(STATUS_LABEL) as StationStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <StatusDot status={s} />
          {STATUS_LABEL[s]}
        </span>
      ))}
      <span className="text-faint">pino quadrado = carga DC</span>
    </div>
  );
}

/** GPS problems (permission denied, far from Salvador…) with a retry and a manual fallback. */
function LocationNotice() {
  const notice = useAppStore((s) => s.locationNotice);
  const status = useAppStore((s) => s.locationStatus);
  const dismiss = useAppStore((s) => s.dismissLocationNotice);
  const locateMe = useAppStore((s) => s.locateMe);
  const setPickingLocation = useAppStore((s) => s.setPickingLocation);
  if (!notice) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-3 md:top-3">
      <div
        role="status"
        data-testid="location-notice"
        className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm text-fg-2 shadow-xl"
      >
        <p className="flex-1 leading-snug">{notice}</p>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          {status === 'error' && (
            <>
              <button type="button" data-testid="btn-location-retry" onClick={() => void locateMe()} className="text-accent underline">
                tentar de novo
              </button>
              <button
                type="button"
                data-testid="btn-location-manual"
                onClick={() => {
                  setPickingLocation(true);
                  dismiss();
                }}
                className="text-muted underline"
              >
                marcar no mapa
              </button>
            </>
          )}
        </div>
        <button type="button" data-testid="btn-location-dismiss" aria-label="Fechar aviso" onClick={dismiss} className="text-faint hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const viewMode = useAppStore((s) => s.viewMode);
  const navigating = useAppStore((s) => s.navigation !== null);
  const carMode = useAppStore((s) => s.carMode);

  // Ask for the device position as soon as the app opens.
  useEffect(() => {
    void useAppStore.getState().locateMe();
  }, []);

  if (carMode) return <CarMode />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base text-fg">
      <Header />
      <main className="relative flex-1 overflow-hidden">
        <SalvadorMap />
        {navigating ? (
          <NavigationOverlay />
        ) : (
          <>
            <Sidebar />
            <Legend />
            {viewMode === 'smartcity' && <SmartCityPanel />}
            <StationDrawer />
            <LocationNotice />
          </>
        )}
        <NavigationController />
      </main>
      <QaPanel />
      <FraudAlertModal />
      <StationFormModal />
    </div>
  );
}
