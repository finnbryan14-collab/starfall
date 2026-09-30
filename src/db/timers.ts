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

/**
 * Five expedition slots, stored one row each.
 *
 * A slot's `setAt` is when it was sent and its `config.hours` is how long for,
 * which is everything `expeditionAt` needs. An empty slot has no row at all
 * rather than a row meaning "idle", so the store never carries a state that
 * has to be interpreted.
 */
export const EXPEDITION_SLOTS = 5;

export const expeditionId = (slot: number) => `expedition-${slot}`;

export async function clearTimer(id: string): Promise<void> {
  await db.timers.delete(id);
}

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

/**
 * Records a reading that was true at some moment other than now.
 *
 * HoYoLAB reports countdowns, not start times, so importing one means placing
 * the reading in the past — see engine/timers/from-notes. Existing config is
 * kept, because the teapot rate and cap are the player's settings, not the
 * import's.
 */
export async function setTimerAt(
  id: string,
  value: number,
  setAt: number,
  config?: Record<string, number>,
): Promise<TimerRow> {
  const existing = await db.timers.get(id);
  const row: TimerRow = {
    id,
    setAt,
    value,
    config: { ...existing?.config, ...config },
    updatedAt: Date.now(),
  };
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
