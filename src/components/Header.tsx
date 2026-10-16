import { Car, SlidersHorizontal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { VEHICLE_BY_ID, VEHICLES } from '../data/salvadorStations';
import { autonomyKm } from '../lib/geo';
import { cn, formatHour } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { RangeInput, Select } from './ui';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </div>
  );
}

export function Header() {
  const vehicleId = useAppStore((s) => s.vehicleId);
  const setVehicle = useAppStore((s) => s.setVehicle);
  const batteryPct = useAppStore((s) => s.batteryPct);
  const setBattery = useAppStore((s) => s.setBattery);
  const simHour = useAppStore((s) => s.simHour);
  const setSimHour = useAppStore((s) => s.setSimHour);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setQaPanelOpen = useAppStore((s) => s.setQaPanelOpen);
  const setCarMode = useAppStore((s) => s.setCarMode);
  const qaCount = useAppStore((s) => s.qaLog.length);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const range = autonomyKm(VEHICLE_BY_ID[vehicleId], batteryPct);
  const isPeak = simHour >= 16 && simHour < 21;

  return (
    <header
      data-testid="app-header"
      className="relative z-30 border-b border-line bg-surface px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="mr-2 flex items-center gap-3 self-center mobile:w-full">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight text-fg">VoltSSA</div>
            <div className="truncate text-[11px] text-muted">
              <span className="mobile:hidden">Recarga de veículos elétricos em Salvador</span>
              <span className="desktop:hidden tabular-nums">
                {VEHICLE_BY_ID[vehicleId].name} · {batteryPct}% · ~{range.toFixed(0)} km · {formatHour(simHour)}
              </span>
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-toggle-settings"
            aria-expanded={settingsOpen}
            aria-label="Ajustes do veículo e do horário"
            onClick={() => setSettingsOpen((v) => !v)}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm desktop:hidden',
              settingsOpen ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-fg-2',
            )}
          >
            <SlidersHorizontal className="h-4 w-4" /> Ajustes
          </button>
          <button
            type="button"
            data-testid="btn-car-mode-mobile"
            aria-label="Abrir modo carro"
            onClick={() => setCarMode(true)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-line-strong text-fg-2 desktop:hidden"
          >
            <Car className="h-4 w-4" />
          </button>
        </div>

        <div
          data-testid="header-settings"
          className={cn(
            'gap-x-6 gap-y-3 mobile:w-full mobile:flex-col desktop:flex desktop:flex-wrap desktop:items-end',
            settingsOpen ? 'flex' : 'hidden',
          )}
        >
          <Field label="Veículo">
            <Select testId="select-vehicle" label="Selecionar veículo" value={vehicleId} onChange={setVehicle} className="mobile:w-full mobile:text-base">
              {VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.description}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Bateria">
            <div className="flex h-[34px] items-center gap-2">
              <div className="w-28 mobile:flex-1">
                <RangeInput testId="slider-battery" label="Nível de bateria atual" min={5} max={100} value={batteryPct} onChange={setBattery} />
              </div>
              <span data-testid="battery-value" className={cn('w-9 text-sm tabular-nums', batteryPct <= 15 ? 'text-red-400' : 'text-fg')}>
                {batteryPct}%
              </span>
              <span data-testid="range-km" className="text-xs text-muted tabular-nums" title="Autonomia em pista plana">
                ~{range.toFixed(0)} km
              </span>
            </div>
          </Field>

          <Field label="Hora simulada">
            <div className="flex h-[34px] items-center gap-2">
              <div className="w-28 mobile:flex-1">
                <RangeInput testId="slider-sim-hour" label="Hora simulada do sistema" min={0} max={23} value={simHour} onChange={setSimHour} />
              </div>
              <span data-testid="sim-hour-value" className="w-11 text-sm text-fg tabular-nums">
                {formatHour(simHour)}
              </span>
              {isPeak && (
                <span data-testid="peak-hour-indicator" className="text-xs text-amber-400">
                  horário de ponta
                </span>
              )}
            </div>
          </Field>

          <div className="flex items-center gap-2 desktop:ml-auto desktop:self-center">
            <div role="tablist" aria-label="Modo de visualização" className="flex rounded-md border border-line-strong p-0.5 mobile:flex-1">
              {(
                [
                  ['driver', 'toggle-view-driver', 'Motorista'],
                  ['smartcity', 'toggle-view-smartcity', 'Smart City'],
                ] as const
              ).map(([mode, testId, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  data-testid={testId}
                  onClick={() => {
                    setViewMode(mode);
                    setSettingsOpen(false);
                  }}
                  className={cn(
                    'rounded px-3 py-1 text-sm transition-colors mobile:flex-1 mobile:py-2',
                    viewMode === mode ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="btn-car-mode"
              onClick={() => setCarMode(true)}
              className="flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg-2 hover:bg-surface-2 mobile:hidden"
            >
              <Car className="h-4 w-4" /> Modo carro
            </button>
            <button
              type="button"
              data-testid="btn-open-qa-panel"
              onClick={() => {
                setQaPanelOpen(true);
                setSettingsOpen(false);
              }}
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg-2 hover:bg-surface-2 mobile:py-2"
            >
              QA
              <span className="mobile:hidden"> e testes</span>
              {qaCount > 0 && <span className="ml-1.5 text-muted tabular-nums">{qaCount}</span>}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
