import { useEffect, useMemo, useState } from 'react';
import { VEHICLE_BY_ID } from '../../data/salvadorStations';
import { bestConnector, isCompatible, PLUG_LABEL, usableConnectors } from '../../lib/compatibility';
import { minutesUntilClose } from '../../lib/hours';
import { estimateCharge } from '../../lib/pricing';
import { formatBRL, formatClock, formatDuration, formatHour, formatKwh } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import type { Station, StationRuntime } from '../../types';
import { Notice, RangeInput, Section, Select, Stat } from '../ui';

export function CostCalculator({ station, runtime }: { station: Station; runtime: StationRuntime }) {
  const vehicleId = useAppStore((s) => s.vehicleId);
  const batteryPct = useAppStore((s) => s.batteryPct);
  const simHour = useAppStore((s) => s.simHour);
  const vehicle = VEHICLE_BY_ID[vehicleId];

  const [currentPct, setCurrentPct] = useState(batteryPct);
  const [targetPct, setTargetPct] = useState(80);
  const [startHour, setStartHour] = useState(simHour);
  const [connectorIdx, setConnectorIdx] = useState(0);

  // Follow the global header controls when they change.
  useEffect(() => setCurrentPct(batteryPct), [batteryPct]);
  useEffect(() => setStartHour(simHour), [simHour]);

  const options = usableConnectors(station, vehicle);
  const compatible = isCompatible(station, vehicle);
  const pool = options.length > 0 ? options : station.connectors;
  const defaultConnector = bestConnector(station, vehicle, runtime.powerSplit);
  const connector = pool[connectorIdx] ?? defaultConnector;

  useEffect(() => {
    const idx = pool.indexOf(defaultConnector);
    setConnectorIdx(idx >= 0 ? idx : 0);
  }, [station.id, vehicleId]);

  const target = Math.max(targetPct, currentPct);
  const estimate = useMemo(
    () =>
      estimateCharge({
        station,
        vehicle,
        connector,
        currentPct,
        targetPct: target,
        startHour,
        powerSplit: runtime.powerSplit,
      }),
    [station, vehicle, connector, currentPct, target, startHour, runtime.powerSplit],
  );

  const closeIn = minutesUntilClose(station.hours, startHour);
  const exceedsClosing = Number.isFinite(closeIn) && closeIn > 0 && estimate.durationMin > closeIn;
  const closedAtStart = Number.isFinite(closeIn) && closeIn === 0;

  return (
    <div data-testid="cost-calculator">
      <Section title="Simulação">
        {!compatible && (
          <div className="mb-3">
            <Notice tone="red" testId="calc-incompatible-warning">
              Seu veículo não é compatível com este posto. Valores apenas ilustrativos.
            </Notice>
          </div>
        )}
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1 flex justify-between text-muted">
              <span>Bateria atual</span>
              <span className="text-fg tabular-nums" data-testid="calc-current-value">
                {currentPct}%
              </span>
            </div>
            <RangeInput testId="calc-current-pct" label="Porcentagem atual" min={0} max={99} value={currentPct} onChange={setCurrentPct} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-muted">
              <span>Carregar até</span>
              <span className="text-fg tabular-nums" data-testid="calc-target-value">
                {target}%
              </span>
            </div>
            <RangeInput testId="calc-target-pct" label="Porcentagem desejada" min={1} max={100} value={target} onChange={setTargetPct} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-muted">
              Início
              <Select testId="calc-start-hour" value={startHour} onChange={(v) => setStartHour(Number(v))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-muted">
              Conector
              <Select testId="calc-connector" value={connectorIdx} onChange={(v) => setConnectorIdx(Number(v))}>
                {pool.map((c, i) => (
                  <option key={i} value={i}>
                    {PLUG_LABEL[c.type]} {c.powerKw} kW
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>
      </Section>

      {estimate.restricted ? (
        <Section title="Resultado">
          <p className="text-sm text-muted" data-testid="calc-restricted">
            {station.priceLabel}. Sem tarifa para visitantes.
          </p>
        </Section>
      ) : (
        <Section title="Resultado">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Energia" value={<span data-testid="calc-kwh">{formatKwh(estimate.energyBilledKwh)}</span>} />
            <Stat label="Potência" value={<span data-testid="calc-power">{estimate.effectivePowerKw.toFixed(1)} kW</span>} />
            <Stat label="Tempo" value={<span data-testid="calc-duration">{formatDuration(estimate.durationMin)}</span>} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {formatClock(estimate.startMinuteOfDay)} às {formatClock(estimate.endMinuteOfDay)}. Inclui 10% de perdas na recarga.
          </p>

          <table className="mt-4 w-full text-sm" data-testid="calc-breakdown">
            <tbody>
              {estimate.buckets.map((b) => (
                <tr key={b.label} data-testid={`calc-bucket-${b.peak ? 'peak' : 'offpeak'}`} className="border-b border-line">
                  <td className="py-2 text-fg-2">
                    {b.label}
                    <span className="block text-xs text-muted tabular-nums">
                      {formatKwh(b.kwh)} × {formatBRL(b.pricePerKwh)}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatBRL(b.cost)}</td>
                </tr>
              ))}
              <tr className="border-b border-line">
                <td className="py-2 text-fg-2">Taxa de desbloqueio</td>
                <td className="py-2 text-right tabular-nums" data-testid="calc-unlock-fee">
                  {formatBRL(estimate.unlockFee)}
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 text-fg-2">
                  Estacionamento
                  <span className="block text-xs text-muted">{station.parkingLabel}</span>
                </td>
                <td className="py-2 text-right tabular-nums" data-testid="calc-parking">
                  {formatBRL(estimate.parkingCost)}
                </td>
              </tr>
              <tr>
                <td className="pt-3 font-medium text-fg">Total</td>
                <td className="pt-3 text-right text-lg font-semibold text-fg tabular-nums" data-testid="calc-total">
                  {formatBRL(estimate.total)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 space-y-2">
            {estimate.energyCost === 0 && estimate.parkingCost > 0 && (
              <Notice testId="calc-parking-trap">
                A energia é gratuita, mas o estacionamento custa {formatBRL(estimate.parkingCost)} pelo tempo de recarga.
              </Notice>
            )}
            {estimate.crossesPeak && (
              <Notice tone="amber" testId="calc-crosses-peak">
                A recarga passa pelo horário de ponta. O preço é calculado minuto a minuto.
              </Notice>
            )}
            {exceedsClosing && (
              <Notice tone="amber" testId="calc-exceeds-closing">
                O posto fecha antes do fim da recarga ({station.hoursLabel}). Tempo disponível: {formatDuration(closeIn)}.
              </Notice>
            )}
            {closedAtStart && <Notice tone="red">Posto fechado às {formatHour(startHour)}.</Notice>}
          </div>
        </Section>
      )}
    </div>
  );
}
