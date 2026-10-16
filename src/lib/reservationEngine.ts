import { sleep } from './utils';

/**
 * Minimal async mutex: callers are chained so the critical section never
 * interleaves, even when two requests arrive in the same millisecond.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export interface SlotSnapshot {
  capacity: number;
  taken: number;
}

/** Storage port — lets the same engine drive the real store or an isolated sandbox. */
export interface SlotStore {
  read(): SlotSnapshot;
  commit(driver: string): void;
}

export type ReservationOutcome =
  | { status: 'confirmed'; driver: string; readAt: number; committedAt: number; seenFree: number }
  | { status: 'rejected'; driver: string; readAt: number; committedAt: number; seenFree: number };

export interface ReserveOptions {
  useLock: boolean;
  /** Simulated DB/network round trip between "check" and "act". */
  latencyMs?: number;
}

/**
 * Check-then-act reservation. Without the lock, two concurrent callers both read
 * `free = 1` before either commits → overbooking. With the lock the second caller
 * re-reads after the first commit and is rejected (sent to the virtual queue).
 */
export class ReservationEngine {
  private readonly mutex = new Mutex();

  constructor(private readonly store: SlotStore) {}

  async reserve(driver: string, options: ReserveOptions): Promise<ReservationOutcome> {
    const attempt = async (): Promise<ReservationOutcome> => {
      const readAt = performance.now();
      const snapshot = this.store.read();
      const seenFree = snapshot.capacity - snapshot.taken;
      await sleep(options.latencyMs ?? 25);
      if (seenFree <= 0) {
        return { status: 'rejected', driver, readAt, committedAt: performance.now(), seenFree };
      }
      this.store.commit(driver);
      return { status: 'confirmed', driver, readAt, committedAt: performance.now(), seenFree };
    };
    return options.useLock ? this.mutex.runExclusive(attempt) : attempt();
  }
}

export interface RaceResult {
  useLock: boolean;
  startedAt: [number, number];
  outcomes: ReservationOutcome[];
  capacity: number;
  finalTaken: number;
  overbooked: boolean;
}

/** Two drivers fire at the very same millisecond for the last free slot. */
export async function simulateLastSlotRace(useLock: boolean, latencyMs = 40): Promise<RaceResult> {
  const capacity = 1;
  const committed: string[] = [];
  const engine = new ReservationEngine({
    read: () => ({ capacity, taken: committed.length }),
    commit: (driver) => {
      committed.push(driver);
    },
  });

  const tA = Date.now();
  const requestA = engine.reserve('Motorista A', { useLock, latencyMs });
  const tB = Date.now();
  const requestB = engine.reserve('Motorista B', { useLock, latencyMs });
  const outcomes = await Promise.all([requestA, requestB]);

  return {
    useLock,
    startedAt: [tA, tB],
    outcomes,
    capacity,
    finalTaken: committed.length,
    overbooked: committed.length > capacity,
  };
}
