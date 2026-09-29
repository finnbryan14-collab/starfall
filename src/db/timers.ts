import { db, type TimerRow } from './schema';

/**
 * Reading and writing timer state.
 *
 * A timer is stored as the value the player last confirmed and the moment they
 * confirmed it. Nothing stores a countdown, so nothing can drift.
 */

export const TIMER_IDS = {
  resin: 'resin',
  transformer: 'transformer',
  realmCurrency: 'realm-currency',
} as const;

export async function listTimers(): Promise<TimerRow[]> {
  return db.timers.toArray();
}

export async function setTimer(
  id: string,
  value: number,
  config?: Record<string, number>,
): Promise<TimerRow> {
  const now = Date.now();
  const row: TimerRow = { id, setAt: now, value, config, updatedAt: now };
  await db.timers.put(row);
  return row;
}

/** Updates configuration without restarting the timer. */
export async function setTimerConfig(
  id: string,
  config: Record<string, number>,
): Promise<TimerRow | undefined> {
  const existing = await db.timers.get(id);
  if (!existing) return undefined;
  const row: TimerRow = {
    ...existing,
    config: { ...existing.config, ...config },
    updatedAt: Date.now(),
  };
  await db.timers.put(row);
  return row;
}

export async function clearTimers(): Promise<void> {
  await db.timers.clear();
}
