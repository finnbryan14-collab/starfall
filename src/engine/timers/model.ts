import { MS_PER_HOUR, MS_PER_MINUTE } from '../time';

/**
 * Timers, computed from when you last told us a value plus the rule.
 *
 * Nothing here ticks. A countdown that decrements on an interval drifts while
 * the tab is backgrounded and is simply wrong after the app has been closed
 * overnight — so every timer is derived from a stored `setAt` and the elapsed
 * time, and is correct whenever it is next read (docs/MATH.md section 5).
 *
 * Sources for the rules:
 *   Resin: 1 per 8 minutes, cap 200 (raised from 160 in version 4.7)
 *     https://genshin-impact.fandom.com/wiki/Original_Resin
 *   Parametric Transformer: 6 days 22 hours, despite the gadget saying 7 days
 *     https://genshin-impact.fandom.com/wiki/Parametric_Transformer
 *   verifiedAt: 2026-09-29
 */

export const RESIN_CAP = 200;
export const RESIN_MINUTES_PER_POINT = 8;

/**
 * 166 hours, not 168.
 *
 * MATH.md said "about 7 days (verify exact hours)", and the gadget's own
 * description rounds to 7 days. The real cooldown is 6 days 22 hours, so a
 * 7-day assumption would tell a player to wait two hours longer than they need
 * to, every single week.
 */
export const TRANSFORMER_COOLDOWN_HOURS = 166;

export const EXPEDITION_DURATIONS_HOURS = [4, 8, 12, 20] as const;
export type ExpeditionHours = (typeof EXPEDITION_DURATIONS_HOURS)[number];

/** Elapsed milliseconds, never negative — a clock behind the reading is not a rewind. */
function elapsedSince(setAt: number, now: Date): number {
  return Math.max(0, now.getTime() - setAt);
}

export type ResinInput = {
  /** When the player last told us the value. */
  setAt: number;
  value: number;
};

export type ResinState = {
  value: number;
  full: boolean;
  /** Milliseconds until the cap. Zero when already full. */
  untilFullMs: number;
  /** When it fills, or null if it already has. */
  fullAt: Date | null;
};

export function resinAt({ setAt, value }: ResinInput, now: Date, cap = RESIN_CAP): ResinState {
  if (value < 0) throw new RangeError(`resin value must be >= 0, got ${value}`);

  const gained = Math.floor(elapsedSince(setAt, now) / (RESIN_MINUTES_PER_POINT * MS_PER_MINUTE));
  const current = Math.min(cap, value + gained);
  const missing = cap - current;

  if (missing <= 0) {
    return { value: cap, full: true, untilFullMs: 0, fullAt: null };
  }

  const untilFullMs = missing * RESIN_MINUTES_PER_POINT * MS_PER_MINUTE;
  return {
    value: current,
    full: false,
    untilFullMs,
    fullAt: new Date(now.getTime() + untilFullMs),
  };
}

export type TransformerInput = { usedAt: number };

export type TransformerState = {
  ready: boolean;
  untilReadyMs: number;
  readyAt: Date;
  /** How far through the cooldown, 0 to 1. */
  progress: number;
};

export function transformerAt({ usedAt }: TransformerInput, now: Date): TransformerState {
  const cooldownMs = TRANSFORMER_COOLDOWN_HOURS * MS_PER_HOUR;
  const elapsed = elapsedSince(usedAt, now);
  const untilReadyMs = Math.max(0, cooldownMs - elapsed);

  return {
    ready: untilReadyMs === 0,
    untilReadyMs,
    readyAt: new Date(usedAt + cooldownMs),
    progress: Math.min(1, elapsed / cooldownMs),
  };
}

export type ExpeditionInput = { startedAt: number; hours: ExpeditionHours };

export type ExpeditionState = {
  done: boolean;
  untilDoneMs: number;
  doneAt: Date;
  progress: number;
};

export function expeditionAt({ startedAt, hours }: ExpeditionInput, now: Date): ExpeditionState {
  if (!EXPEDITION_DURATIONS_HOURS.includes(hours)) {
    throw new RangeError(
      `expedition must be one of ${EXPEDITION_DURATIONS_HOURS.join(', ')} hours, got ${hours}`,
    );
  }

  const durationMs = hours * MS_PER_HOUR;
  const elapsed = elapsedSince(startedAt, now);
  const untilDoneMs = Math.max(0, durationMs - elapsed);

  return {
    done: untilDoneMs === 0,
    untilDoneMs,
    doneAt: new Date(startedAt + durationMs),
    progress: Math.min(1, elapsed / durationMs),
  };
}

export type RealmCurrencyInput = {
  setAt: number;
  value: number;
  /**
   * The teapot's rate, which depends on Adeptal Energy and the trust rank, so
   * the player reads it off their own Serenitea Pot rather than us guessing.
   */
  ratePerHour: number;
  cap: number;
};

export type RealmCurrencyState = {
  value: number;
  full: boolean;
  untilFullMs: number;
  fullAt: Date | null;
};

export function realmCurrencyAt(
  { setAt, value, ratePerHour, cap }: RealmCurrencyInput,
  now: Date,
): RealmCurrencyState {
  if (value < 0) throw new RangeError(`realm currency must be >= 0, got ${value}`);
  if (ratePerHour < 0) throw new RangeError(`rate must be >= 0, got ${ratePerHour}`);
  if (cap < value) throw new RangeError(`cap ${cap} is below the current value ${value}`);

  const gained = Math.floor((elapsedSince(setAt, now) / MS_PER_HOUR) * ratePerHour);
  const current = Math.min(cap, value + gained);
  const missing = cap - current;

  // A teapot with no Adeptal Energy produces nothing, so it never fills.
  if (missing <= 0 || ratePerHour === 0) {
    return { value: current, full: missing <= 0, untilFullMs: 0, fullAt: null };
  }

  const untilFullMs = (missing / ratePerHour) * MS_PER_HOUR;
  return {
    value: current,
    full: false,
    untilFullMs,
    fullAt: new Date(now.getTime() + untilFullMs),
  };
}
