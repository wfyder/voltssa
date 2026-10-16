import { X } from 'lucide-react';
import { useState } from 'react';
import { VEHICLE_BY_ID } from '../../data/salvadorStations';
import { runSelfTests } from '../../lib/qaSelfTest';
import { exportReport } from '../../lib/report';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import type { QaEvent, QaSeverity } from '../../types';
import { Button, Select } from '../ui';

const SEVERITY_CLS: Record<QaSeverity, string> = {
  info: 'bg-faint',
  pass: 'bg-green-600',
  warn: 'bg-amber-500',
  fail: 'bg-red-600',
};
const CATEGORIES: (QaEvent['category'] | 'all')[] = ['all', 'fraud', 'race', 'ocpp', 'power', 'reservation', 'crowd', 'rule', 'route', 'selftest'];

export function QaPanel() {
  const open = useAppStore((s) => s.qaPanelOpen);
  const setOpen = useAppStore((s) => s.setQaPanelOpen);
  const qaLog = useAppStore((s) => s.qaLog);
  const clearQaLog = useAppStore((s) => s.clearQaLog);
  const selfTests = useAppStore((s) => s.selfTests);
  const setSelfTests = useAppStore((s) => s.setSelfTests);
  const logQa = useAppStore((s) => s.logQa);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const [running, setRunning] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');

  if (!open) return null;

  const run = async () => {
    setRunning(true);
    const results = await runSelfTests();
    setSelfTests(results);
    setRunning(false);
    const passed = results.filter((r) => r.passed).length;
    logQa('selftest', passed === results.length ? 'pass' : 'fail', `Suíte de autoteste: ${passed}/${results.length} aprovados`);
  };

  const onExport = (format: 'md' | 'json') => {
    const s = useAppStore.getState();
    exportReport(
      {
        stations: s.stations,
        qaLog: s.qaLog,
        runtime: s.runtime,
        selfTests: s.selfTests,
        context: { vehicle: VEHICLE_BY_ID[s.vehicleId].name, batteryPct: s.batteryPct, simHour: s.simHour },
      },
      format,
    );
  };

  const events = category === 'all' ? qaLog : qaLog.filter((e) => e.category === category);
  const passed = selfTests?.filter((t) => t.passed).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="qa-panel-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qa-panel-title"
        data-testid="qa-panel"
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-md bg-surface shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="qa-panel-title" className="text-base font-semibold text-fg">
            QA e testes
          </h2>
          <div className="flex items-center gap-1">
            <Button
              testId="btn-open-chaos-mode"
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setViewMode('smartcity');
                setOpen(false);
              }}
            >
              Abrir testes de falha
            </Button>
            <button
              type="button"
              data-testid="btn-close-qa-panel"
              aria-label="Fechar painel de QA"
              onClick={() => setOpen(false)}
              className="rounded p-1.5 text-faint hover:bg-surface-3 hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <section className="ev-scroll min-h-0 overflow-y-auto border-b border-line p-5 md:border-r md:border-b-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-fg">Regras de negócio</h3>
              {selfTests && (
                <span data-testid="selftest-summary" className={cn('text-sm tabular-nums', passed === selfTests.length ? 'text-green-400' : 'text-red-400')}>
                  {passed} de {selfTests.length} aprovados
                </span>
              )}
            </div>
            <Button testId="btn-run-selftests" onClick={run} disabled={running} className="w-full">
              {running ? 'Executando…' : 'Executar testes'}
            </Button>
            {selfTests ? (
              <ul className="mt-4 divide-y divide-line" data-testid="selftest-results">
                {selfTests.map((t) => (
                  <li key={t.id} data-testid={`selftest-${t.id}`} data-passed={t.passed} className="py-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-0.5 shrink-0 text-xs', t.passed ? 'text-green-400' : 'text-red-400')}>
                        {t.passed ? 'ok' : 'falhou'}
                      </span>
                      <div>
                        <div className="text-fg">{t.name}</div>
                        <div className="text-xs text-muted">{t.detail}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Verifica a base de 43 postos, tarifa de ponta, horário comercial, antifraude por distância, consenso de
                reportes, compatibilidade de plugue, estacionamento, taxa de ativação, divisão de potência e concorrência
                na reserva.
              </p>
            )}
            <p className="mt-5 text-xs leading-relaxed text-muted">
              Para automação com Playwright, todos os controles têm <code>data-testid</code> e o estado fica em{' '}
              <code>window.__voltStore</code>.
            </p>
          </section>

          <section className="flex min-h-0 flex-col p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-fg">
                Eventos <span className="font-normal text-muted tabular-nums">{qaLog.length}</span>
              </h3>
              <div className="flex items-center gap-2">
                <Select
                  testId="select-qa-log-category"
                  value={category}
                  onChange={(v) => setCategory(v as typeof category)}
                  className="py-1 text-xs"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'all' ? 'todas' : c}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  data-testid="btn-clear-qa-log"
                  onClick={clearQaLog}
                  className="text-xs text-muted underline hover:text-fg"
                >
                  limpar
                </button>
              </div>
            </div>
            <ul className="ev-scroll min-h-[200px] flex-1 overflow-y-auto" data-testid="qa-log">
              {events.map((e) => (
                <li
                  key={e.id}
                  data-testid="qa-log-entry"
                  data-category={e.category}
                  className="flex gap-2 border-b border-line py-1.5 text-xs"
                >
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_CLS[e.severity])} />
                  <span className="shrink-0 text-faint tabular-nums">{new Date(e.at).toLocaleTimeString('pt-BR')}</span>
                  <span className="text-fg-2">{e.message}</span>
                </li>
              ))}
              {events.length === 0 && <li className="py-8 text-center text-xs text-faint">Nenhum evento ainda.</li>}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button testId="btn-qa-export-md" variant="secondary" onClick={() => onExport('md')} className="flex-1 text-xs">
                Baixar .md
              </Button>
              <Button testId="btn-qa-export-json" variant="secondary" onClick={() => onExport('json')} className="flex-1 text-xs">
                Baixar .json
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
