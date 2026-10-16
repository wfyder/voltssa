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
      className="absolute top-3 z-10 flex gap-4 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-[left] duration-300"
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

export default function App() {
  const viewMode = useAppStore((s) => s.viewMode);
  const navigating = useAppStore((s) => s.navigation !== null);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base text-fg">
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
