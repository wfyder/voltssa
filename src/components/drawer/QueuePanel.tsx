import { useState } from 'react';
import { simulateLastSlotRace, type RaceResult } from '../../lib/reservationEngine';
import { cn, formatDuration } from '../../lib/utils';
import {
  BLOCK_REASON_LABEL,
  blockReason,
  CURRENT_USER_ID,
  estimatedWaitMin,
  occupiedSlots,
  useAppStore,
} from '../../store/useAppStore';
import type { Station, StationRuntime } from '../../types';
import { Button, Notice, Section, Stat } from '../ui';

function RaceSimulator({ stationName }: { stationName: string }) {
  const logQa = useAppStore((s) => s.logQa);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RaceResult[]>([]);

  const run = async () => {
    setRunning(true);
    const [unsafe, safe] = await Promise.all([simulateLastSlotRace(false), simulateLastSlotRace(true)]);
    setResults([unsafe, safe]);
    setRunning(false);
    logQa(
      'race',
      unsafe.overbooked ? 'fail' : 'pass',
      `[${stationName}] Sem lock: ${unsafe.finalTaken} reservas para ${unsafe.capacity} vaga${unsafe.overbooked ? ' (overbooking)' : ''}`,
    );
    logQa(
      'race',
      safe.overbooked ? 'fail' : 'pass',
      `[${stationName}] Com mutex: ${safe.finalTaken} reserva para ${safe.capacity} vaga, ${safe.outcomes.filter((o) => o.status === 'rejected').length} enviada(s) à fila`,
    );
  };

  return (
    <Section title="Teste de concorrência">
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Dois motoristas pedem a última vaga no mesmo milissegundo. Sem trava, os dois leem "1 vaga livre" antes de gravar.
        Com mutex, o segundo pedido relê o estado e vai para a fila.
      </p>
      <Button testId="btn-race-simulate" variant="secondary" onClick={run} disabled={running} className="w-full">
        {running ? 'Executando…' : 'Executar teste'}
      </Button>
      {results.length > 0 && (
        <table className="mt-3 w-full text-xs" data-testid="race-results">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-1 font-normal" />
              <th className="pb-1 font-normal">Motorista A</th>
              <th className="pb-1 font-normal">Motorista B</th>
              <th className="pb-1 text-right font-normal">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr
                key={String(r.useLock)}
                data-testid={r.useLock ? 'race-result-locked' : 'race-result-unlocked'}
                data-overbooked={r.overbooked}
                className="border-t border-line"
              >
                <td className="py-1.5 text-fg-2">{r.useLock ? 'Com mutex' : 'Sem lock'}</td>
                {r.outcomes.map((o) => (
                  <td key={o.driver} className="py-1.5 text-muted">
                    {o.status === 'confirmed' ? 'reservou' : 'fila'}
                  </td>
                ))}
                <td className={cn('py-1.5 text-right tabular-nums', r.overbooked ? 'text-red-400' : 'text-green-400')}>
                  {r.finalTaken}/{r.capacity} {r.overbooked ? 'overbooking' : 'ok'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function QueuePanel({ station, runtime }: { station: Station; runtime: StationRuntime }) {
  const vehicleId = useAppStore((s) => s.vehicleId);
  const simHour = useAppStore((s) => s.simHour);
  const reserveSlot = useAppStore((s) => s.reserveSlot);
  const cancelReservation = useAppStore((s) => s.cancelReservation);
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const block = blockReason(station, runtime, vehicleId, simHour);
  const occupied = occupiedSlots(runtime);
  const free = Math.max(0, station.slots - occupied);
  const reservedSlots = runtime.reservations.filter((r) => r.kind === 'slot').length;
  const queue = runtime.reservations.filter((r) => r.kind === 'queue');
  const mySlot = runtime.reservations.find((r) => r.driver === CURRENT_USER_ID && r.kind === 'slot');
  const myQueueIdx = queue.findIndex((r) => r.driver === CURRENT_USER_ID);
  const nextRelease = runtime.sessions.length ? Math.min(...runtime.sessions.map((s) => s.remainingMin)) : 0;
  const alreadyIn = Boolean(mySlot) || myQueueIdx >= 0;

  const onReserve = async () => {
    setPending(true);
    const result = await reserveSlot(station.id);
    setPending(false);
    setLastResult(
      result === 'confirmed'
        ? 'Vaga reservada. Tolerância de 15 minutos.'
        : result === 'queued'
          ? 'Sem vagas livres. Você entrou na fila.'
          : 'Reserva bloqueada.',
    );
  };

  return (
    <div data-testid="queue-panel">
      <Section title="Ocupação">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Carregando" value={runtime.sessions.length} testId="stat-charging" />
          <Stat label="Livres" value={free} testId="stat-free-slots" />
          <Stat label="Na fila" value={queue.length} testId="stat-queue-size" />
        </div>

        <div className="mt-4 flex flex-wrap gap-1" data-testid="slot-grid">
          {Array.from({ length: Math.min(station.slots, 33) }, (_, i) => {
            const session = runtime.sessions[i];
            const reserved = !session && i - runtime.sessions.length < reservedSlots;
            return (
              <span
                key={i}
                data-testid={`slot-${i}`}
                data-state={session ? 'charging' : reserved ? 'reserved' : 'free'}
                title={session ? `Libera em ${formatDuration(session.remainingMin)}` : reserved ? 'Reservada' : 'Livre'}
                className={cn(
                  'h-3 w-6 rounded-sm',
                  session && 'bg-fg-2',
                  reserved && 'bg-accent',
                  !session && !reserved && 'border border-line-strong bg-surface',
                )}
              />
            );
          })}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm bg-fg-2" /> carregando</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm bg-accent" /> reservada</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm border border-line-strong" /> livre</span>
        </div>

        {free === 0 && (
          <p className="mt-3 text-sm text-fg-2" data-testid="next-release">
            Próxima vaga em cerca de {formatDuration(nextRelease)}.
          </p>
        )}
        {runtime.sessions.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-xs text-muted">
            {runtime.sessions.slice(0, 6).map((s) => (
              <li key={s.id} className="flex justify-between tabular-nums">
                <span>{s.driver}</span>
                <span>libera em {formatDuration(s.remainingMin)}</span>
              </li>
            ))}
            {runtime.sessions.length > 6 && <li>e mais {runtime.sessions.length - 6}</li>}
          </ul>
        )}
      </Section>

      <Section title="Reserva">
        {block && (
          <div className="mb-3">
            <Notice tone="red" testId="reserve-blocked-reason">
              Indisponível: {BLOCK_REASON_LABEL[block].toLowerCase()}
              {block === 'closed' && ` (${station.hoursLabel})`}.
            </Notice>
          </div>
        )}
        <Button testId="btn-reserve" onClick={onReserve} disabled={Boolean(block) || pending || alreadyIn} className="w-full">
          {pending ? 'Reservando…' : free > 0 ? 'Reservar vaga' : 'Entrar na fila'}
        </Button>
        {lastResult && (
          <p className="mt-2 text-xs text-muted" data-testid="reserve-result">
            {lastResult}
          </p>
        )}

        {(mySlot || myQueueIdx >= 0) && (
          <div data-testid="my-reservation" className="mt-3 flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
            <div>
              <div className="text-fg">{mySlot ? 'Vaga reservada' : `${myQueueIdx + 1}º na fila`}</div>
              {!mySlot && (
                <div className="text-xs text-muted">
                  Espera estimada: {formatDuration(estimatedWaitMin(runtime, station.slots, myQueueIdx))}
                </div>
              )}
            </div>
            <Button
              testId="btn-cancel-reservation"
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => cancelReservation(station.id, (mySlot ?? queue[myQueueIdx]).id)}
            >
              Cancelar
            </Button>
          </div>
        )}
      </Section>

      <RaceSimulator stationName={station.name} />
    </div>
  );
}
