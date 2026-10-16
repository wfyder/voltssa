import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { CATEGORY_LABEL, STATION_BY_ID } from '../../data/salvadorStations';
import { PLUG_LABEL } from '../../lib/compatibility';
import { draftFromStation, EMPTY_DRAFT, validateDraft, type DraftField, type StationDraft } from '../../lib/stationDraft';
import { cn, formatHour } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import type { PlugType, StationCategory } from '../../types';
import { Button, Notice, Select } from '../ui';

const inputCls =
  'w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none';

function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  testId,
  step = 1,
  min,
}: {
  value: number;
  onChange: (v: number) => void;
  testId: string;
  step?: number;
  min?: number;
}) {
  return (
    <input
      type="number"
      data-testid={testId}
      value={Number.isFinite(value) ? value : ''}
      step={step}
      min={min}
      onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      className={cn(inputCls, 'tabular-nums')}
    />
  );
}

export function StationFormModal() {
  const form = useAppStore((s) => s.stationForm);
  const stations = useAppStore((s) => s.stations);
  const userLocation = useAppStore((s) => s.userLocation);
  const closeStationForm = useAppStore((s) => s.closeStationForm);
  const setPicking = useAppStore((s) => s.setStationFormPicking);
  const setCoords = useAppStore((s) => s.setStationFormCoords);
  const saveStationDraft = useAppStore((s) => s.saveStationDraft);

  const [draft, setDraft] = useState<StationDraft>(EMPTY_DRAFT);
  const [submitted, setSubmitted] = useState(false);

  // Reset the fields each time the form opens (new station or editing one).
  useEffect(() => {
    if (!form.open) return;
    const editing = form.editingId ? STATION_BY_ID[form.editingId] : null;
    setDraft(editing ? draftFromStation(editing) : EMPTY_DRAFT);
    setSubmitted(false);
  }, [form.open, form.editingId]);

  const full: StationDraft = { ...draft, coords: form.coords };
  const validation = validateDraft(full, stations, form.editingId);
  const error = (f: DraftField) => (submitted ? validation.errors[f] : undefined);

  const dialogRef = useRef<HTMLDivElement>(null);
  // Hidden while the user picks a point on the map: no focus trap then.
  useDialog(dialogRef, closeStationForm, form.open && !form.picking);

  if (!form.open) return null;

  const set = <K extends keyof StationDraft>(key: K, value: StationDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setConnector = (i: number, patch: Partial<StationDraft['connectors'][number]>) =>
    setDraft((d) => ({ ...d, connectors: d.connectors.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const onSave = () => {
    setSubmitted(true);
    saveStationDraft(full);
  };

  return (
    <div
      data-testid="station-form-overlay"
      // While the user picks a point on the map the form steps aside but keeps its state.
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4', form.picking && 'hidden')}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="station-form-title"
        data-testid="station-form"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-md bg-surface shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="station-form-title" className="text-base font-semibold text-fg">
            {form.editingId ? 'Editar eletroposto' : 'Adicionar eletroposto'}
          </h2>
          <button
            type="button"
            data-testid="btn-close-station-form"
            aria-label="Fechar"
            onClick={closeStationForm}
            className="rounded p-1.5 text-faint hover:bg-surface-3 hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="ev-scroll flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nome do local" error={error('name')}>
                <input
                  data-testid="input-station-name"
                  data-autofocus
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Ex.: Posto Shell Av. Paralela"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Bairro" error={error('neighborhood')}>
              <input
                data-testid="input-station-neighborhood"
                value={draft.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Tipo de local">
              <Select
                testId="select-station-category"
                value={draft.category}
                onChange={(v) => set('category', v as StationCategory)}
                className="w-full"
              >
                {(Object.keys(CATEGORY_LABEL) as StationCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Endereço (opcional)">
                <input
                  data-testid="input-station-address"
                  value={draft.address}
                  onChange={(e) => set('address', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted">Localização</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button testId="btn-station-pick-on-map" variant="secondary" onClick={() => setPicking(true)} className="text-xs">
                {form.coords ? 'Mudar no mapa' : 'Escolher no mapa'}
              </Button>
              {userLocation && (
                <Button testId="btn-station-use-my-location" variant="ghost" onClick={() => setCoords(userLocation)} className="text-xs">
                  Usar minha localização
                </Button>
              )}
              <span data-testid="station-form-coords" className="text-xs text-muted tabular-nums">
                {form.coords ? `${form.coords.lat.toFixed(5)}, ${form.coords.lng.toFixed(5)}` : 'nenhum ponto escolhido'}
              </span>
            </div>
            {error('coords') && <p className="mt-1 text-xs text-red-400">{error('coords')}</p>}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted">Conectores</span>
              <button
                type="button"
                data-testid="btn-add-connector"
                onClick={() =>
                  set('connectors', [...draft.connectors, { type: 'CCS2_DC', powerKw: 60, pricePerKwh: 2.5 }])
                }
                className="flex items-center gap-1 text-xs text-muted hover:text-fg"
              >
                <Plus className="h-3.5 w-3.5" /> conector
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_28px] gap-2 text-[11px] text-faint">
                <span>Plugue</span>
                <span>Potência (kW)</span>
                <span>Preço (R$/kWh)</span>
                <span />
              </div>
              {draft.connectors.map((c, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_28px] items-center gap-2" data-testid={`connector-row-${i}`}>
                  <Select
                    testId={`select-connector-type-${i}`}
                    value={c.type}
                    onChange={(v) => setConnector(i, { type: v as PlugType })}
                    className="w-full"
                  >
                    {(Object.keys(PLUG_LABEL) as PlugType[]).map((t) => (
                      <option key={t} value={t}>
                        {PLUG_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                  <NumberInput testId={`input-connector-power-${i}`} value={c.powerKw} step={0.1} min={0} onChange={(v) => setConnector(i, { powerKw: v })} />
                  <NumberInput
                    testId={`input-connector-price-${i}`}
                    value={c.pricePerKwh}
                    step={0.01}
                    min={0}
                    onChange={(v) => setConnector(i, { pricePerKwh: v })}
                  />
                  <button
                    type="button"
                    data-testid={`btn-remove-connector-${i}`}
                    aria-label="Remover conector"
                    onClick={() => set('connectors', draft.connectors.filter((_, j) => j !== i))}
                    className="flex h-7 w-7 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-faint">Preço 0 = gratuito. Tipo 2 vai até 22 kW.</p>
            {error('connectors') && <p className="mt-1 text-xs text-red-400">{error('connectors')}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vagas com carregador" error={error('slots')}>
              <NumberInput testId="input-station-slots" value={draft.slots} min={1} onChange={(v) => set('slots', v)} />
            </Field>
            <Field label="Taxa de ativação (R$)" error={error('unlockFee')}>
              <NumberInput testId="input-station-unlock-fee" value={draft.unlockFee} step={0.01} min={0} onChange={(v) => set('unlockFee', v)} />
            </Field>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-muted">Horário de funcionamento</span>
              <label className="flex items-center gap-1.5 text-xs text-fg-2">
                <input
                  type="checkbox"
                  data-testid="checkbox-station-24h"
                  checked={draft.is24h}
                  onChange={(e) => set('is24h', e.target.checked)}
                  className="accent-accent"
                />
                Aberto 24h
              </label>
            </div>
            {!draft.is24h && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Select testId="select-station-open" value={draft.open} onChange={(v) => set('open', Number(v))}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </Select>
                às
                <Select testId="select-station-close" value={draft.close} onChange={(v) => set('close', Number(v))}>
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <option key={h} value={h}>
                      {h === 24 ? '24:00' : formatHour(h)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {error('hours') && <p className="mt-1 text-xs text-red-400">{error('hours')}</p>}
          </div>

          <div>
            <span className="mb-1 block text-xs text-muted">Estacionamento</span>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                testId="select-station-parking"
                value={draft.parkingKind}
                onChange={(v) => set('parkingKind', v as StationDraft['parkingKind'])}
              >
                <option value="unknown">Não sei</option>
                <option value="free">Gratuito</option>
                <option value="flat">Valor fixo</option>
                <option value="hourly">Por hora</option>
              </Select>
              {(draft.parkingKind === 'flat' || draft.parkingKind === 'hourly') && (
                <div className="w-28">
                  <NumberInput testId="input-station-parking-price" value={draft.parkingPrice} step={0.5} min={0} onChange={(v) => set('parkingPrice', v)} />
                </div>
              )}
              {draft.parkingKind === 'hourly' && (
                <>
                  <span className="text-xs text-muted">1ª hora, depois</span>
                  <div className="w-24">
                    <NumberInput
                      testId="input-station-parking-extra"
                      value={draft.parkingExtraPerHour}
                      step={0.5}
                      min={0}
                      onChange={(v) => set('parkingExtraPerHour', v)}
                    />
                  </div>
                  <span className="text-xs text-muted">por hora</span>
                </>
              )}
            </div>
            {error('parking') && <p className="mt-1 text-xs text-red-400">{error('parking')}</p>}
          </div>

          <Field label="Observações (opcional)">
            <textarea
              data-testid="input-station-notes"
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
        </div>

        <footer className="space-y-3 border-t border-line px-5 py-3">
          {validation.warnings.map((w) => (
            <Notice key={w} tone="amber" testId="station-form-warning">
              {w}
            </Notice>
          ))}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-faint">Postos adicionados ficam salvos neste navegador e aparecem como não verificados.</p>
            <div className="flex shrink-0 gap-2">
              <Button testId="btn-cancel-station-form" variant="ghost" onClick={closeStationForm}>
                Cancelar
              </Button>
              <Button testId="btn-save-station" onClick={onSave}>
                {form.editingId ? 'Salvar' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
