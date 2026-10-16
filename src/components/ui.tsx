import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import type { StationStatus } from '../types';

export const STATUS_COLOR: Record<StationStatus, string> = {
  available: '#22c55e',
  busy: '#f59e0b',
  maintenance: '#ef4444',
};

export const STATUS_LABEL: Record<StationStatus, string> = {
  available: 'Disponível',
  busy: 'Ocupado',
  maintenance: 'Em manutenção',
};

type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted',
  green: 'bg-green-500/10 text-green-400',
  amber: 'bg-amber-500/10 text-amber-400',
  red: 'bg-red-500/10 text-red-400',
  blue: 'bg-accent/10 text-accent',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  testId,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', TONES[tone], className)}
    >
      {children}
    </span>
  );
}

export function StatusDot({ status, className }: { status: StationStatus; className?: string }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: STATUS_COLOR[status] }}
    />
  );
}

export function StatusLabel({ status, testId }: { status: StationStatus; testId?: string }) {
  return (
    <span data-testid={testId} data-status={status} className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ReliabilityBar({ value, testId }: { value: number; testId?: string }) {
  return (
    <div className="flex items-center gap-2" data-testid={testId} data-value={value}>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-fg-2 transition-all duration-500" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs text-muted tabular-nums">{value}%</span>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-line bg-surface text-muted hover:border-faint hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

export function RangeInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  testId,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  testId: string;
  label: string;
}) {
  return (
    <input
      type="range"
      data-testid={testId}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="ev-range w-full accent-accent"
    />
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-fg">{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, testId, tone }: { label: string; value: ReactNode; sub?: ReactNode; testId?: string; tone?: string }) {
  return (
    <div data-testid={testId}>
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('mt-0.5 text-base font-medium text-fg tabular-nums', tone)}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Notice({ children, tone = 'neutral', testId }: { children: ReactNode; tone?: 'neutral' | 'red' | 'amber'; testId?: string }) {
  return (
    <p
      data-testid={testId}
      className={cn(
        'rounded-md px-3 py-2 text-xs leading-relaxed',
        tone === 'neutral' && 'bg-surface-3 text-muted',
        tone === 'red' && 'bg-red-500/10 text-red-400',
        tone === 'amber' && 'bg-amber-500/10 text-amber-400',
      )}
    >
      {children}
    </p>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  testId,
  variant = 'primary',
  className,
  title,
  autoFocusInDialog,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testId: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  title?: string;
  /** Receives focus when its dialog opens. */
  autoFocusInDialog?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-autofocus={autoFocusInDialog || undefined}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-accent text-accent-fg hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line-strong bg-surface text-fg-2 hover:bg-surface-2',
        variant === 'danger' && 'border border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10',
        variant === 'ghost' && 'text-muted hover:bg-surface-3 hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  children,
  testId,
  label,
  className,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  testId: string;
  label?: string;
  className?: string;
}) {
  return (
    <select
      data-testid={testId}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none',
        className,
      )}
    >
      {children}
    </select>
  );
}
