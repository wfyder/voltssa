import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import type { Station, StationRuntime } from '../../types';
import { Notice, Section } from '../ui';

const SPOT_W = 26;
const SPOT_H = 36;
const ROW_X0 = 36;
const SPOTS_PER_ROW = 12;
// Row top edges, and the aisle (center y) each row is accessed from.
const ROWS = [
  { y: 36, aisle: 92 },
  { y: 112, aisle: 92 },
  { y: 148, aisle: 204 },
  { y: 224, aisle: 204 },
];
// Rows closest to the elevator core get the EV bays first.
const EV_ROW_PRIORITY = [1, 2, 0, 3];
const ENTRANCE = { x: 14, y: 204 };

interface Spot {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  ev: boolean;
  occupied: boolean;
}

function buildSpots(evCount: number, occupiedEv: number): Spot[] {
  const evOrder: string[] = [];
  for (const row of EV_ROW_PRIORITY) {
    // Fill from the elevator side (right) towards the ramp.
    for (let col = SPOTS_PER_ROW - 1; col >= 0; col--) evOrder.push(`${row}-${col}`);
  }
  const evSet = new Map(evOrder.slice(0, evCount).map((k, i) => [k, i]));

  return ROWS.flatMap((r, row) =>
    Array.from({ length: SPOTS_PER_ROW }, (_, col) => {
      const key = `${row}-${col}`;
      const evIdx = evSet.get(key);
      return {
        index: row * SPOTS_PER_ROW + col,
        row,
        col,
        x: ROW_X0 + col * SPOT_W,
        y: r.y,
        ev: evIdx !== undefined,
        occupied: evIdx !== undefined ? evIdx < occupiedEv : (row * 7 + col * 3) % 5 < 3,
      };
    }),
  );
}

export function IndoorMap({ station, runtime }: { station: Station; runtime: StationRuntime }) {
  const [selected, setSelected] = useState<number | null>(null);
  const evCount = Math.min(station.slots, 33);
  const occupiedEv = Math.min(evCount, runtime.sessions.length + runtime.reservations.filter((r) => r.kind === 'slot').length);
  const spots = useMemo(() => buildSpots(evCount, occupiedEv), [evCount, occupiedEv]);
  const target = selected !== null ? spots[selected] : null;

  const pathD = target
    ? (() => {
        const aisle = ROWS[target.row].aisle;
        const cx = target.x + SPOT_W / 2;
        const cy = target.y + SPOT_H / 2;
        return `M${ENTRANCE.x},${ENTRANCE.y} L24,${ENTRANCE.y} L24,${aisle} L${cx},${aisle} L${cx},${cy}`;
      })()
    : '';

  const freeEv = spots.filter((s) => s.ev && !s.occupied).length;

  return (
    <div data-testid="indoor-panel">
      <div className="mb-4">
        <Notice testId="indoor-offline-banner">
          Modo offline: no subsolo não há sinal de GPS. Esta planta fica salva no aparelho.
        </Notice>
      </div>

      <Section
        title="Piso G1"
        right={
          <span className="text-xs text-muted tabular-nums" data-testid="indoor-free-ev">
            {freeEv} de {evCount} vagas de recarga livres
          </span>
        }
      >
        <svg viewBox="0 0 400 290" className="w-full rounded-md border border-line bg-surface-2" data-testid="indoor-map">
          <rect x="4" y="22" width="392" height="252" rx="4" fill="#141414" stroke="#383838" />
          <text x="10" y="15" className="fill-muted text-[9px]">
            {station.name} · Piso G1
          </text>

          {/* aisles */}
          <rect x="30" y="74" width="330" height="36" fill="#1b1b1b" />
          <rect x="30" y="186" width="330" height="36" fill="#1b1b1b" />
          <rect x="8" y="74" width="26" height="148" fill="#1b1b1b" />

          {/* elevator core */}
          <rect x="356" y="112" width="34" height="72" rx="2" fill="#262626" />
          <text x="373" y="150" textAnchor="middle" className="fill-muted text-[7px]" transform="rotate(-90 373 150)">
            Elevadores
          </text>

          {/* ramp / entrance */}
          <path d="M4 196 L4 214" stroke="#facc15" strokeWidth="3" />
          <text x="8" y="236" className="fill-muted text-[7px]">
            Rampa
          </text>

          {spots.map((s) => {
            const isSel = selected === s.index;
            const fill = s.ev ? (s.occupied ? '#3a3a3a' : 'rgba(34,197,94,0.15)') : s.occupied ? '#242424' : '#141414';
            const stroke = isSel ? '#facc15' : s.ev ? (s.occupied ? '#5a5a5a' : '#22c55e') : '#2e2e2e';
            return (
              <g
                key={s.index}
                data-testid={s.ev ? `indoor-ev-spot-${s.index}` : `indoor-spot-${s.index}`}
                data-occupied={s.occupied}
                onClick={() => s.ev && setSelected(s.index)}
                className={cn(s.ev && 'cursor-pointer')}
              >
                <rect
                  x={s.x + 1.5}
                  y={s.y + 1.5}
                  width={SPOT_W - 3}
                  height={SPOT_H - 3}
                  rx={1.5}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSel ? 2 : 1}
                />
                {s.ev && !s.occupied && (
                  <path d={`M${s.x + 14} ${s.y + 11} l-3.5 6h3l-1 5 4-6.5h-3z`} fill="#22c55e" />
                )}
              </g>
            );
          })}

          {target && (
            <>
              <path
                d={pathD}
                fill="none"
                stroke="#facc15"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="5 4"
                className="ev-dash"
                data-testid="indoor-route-path"
              />
              <circle cx={target.x + SPOT_W / 2} cy={target.y + SPOT_H / 2} r="3.5" fill="#facc15" />
            </>
          )}

          <g data-testid="indoor-you-are-here">
            <circle cx={ENTRANCE.x} cy={ENTRANCE.y} r="5" fill="#facc15" stroke="#0e0e0e" strokeWidth="1.5" />
            <text x={ENTRANCE.x + 8} y={ENTRANCE.y + 20} className="fill-fg-2 text-[7px]">
              Você está aqui
            </text>
          </g>
        </svg>

        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-green-500 bg-green-500/20" /> recarga livre</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#3a3a3a]" /> recarga ocupada</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-line-strong" /> vaga comum</span>
        </div>
        <p className="mt-3 text-sm text-fg-2" data-testid="indoor-instructions">
          {target
            ? `Vaga ${target.index + 1}: desça a rampa, siga pelo corredor ${target.row < 2 ? 'de cima' : 'de baixo'} e pare na ${SPOTS_PER_ROW - target.col}ª vaga antes dos elevadores.`
            : 'Toque em uma vaga de recarga para ver o caminho a partir da rampa.'}
        </p>
      </Section>
    </div>
  );
}
