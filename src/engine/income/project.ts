import { AMERICA_UTC_OFFSET, MS_PER_DAY, resetHourUtc } from '../time';
import {
  IMAGINARIUM_THEATER_RESET_DAY,
  PRIMOGEMS_PER_PULL,
  SPIRAL_ABYSS_RESET_DAY,
  type IncomeAssumptions,
} from './defaults';

// Re-exported so existing callers keep one import site for server-time facts.
export { AMERICA_UTC_OFFSET, DAILY_RESET_HOUR } from '../time';

/**
 * Projecting primogem income between two dates.
 *
 * Income arrives on resets, not on wall-clock days: commissions on the daily
 * reset, the Abyss on the 16th, the Theater on the 1st, the stardust shop on
 * the 1st. Counting resets rather than dividing elapsed time keeps the
 * projection right across a boundary — planning from 03:00 to 05:00 server time
 * crosses a reset and earns a day, while 05:00 to 07:00 does not.
 *
 * See docs/MATH.md section 3.
 */

/**
 * Daily resets in the half-open interval (from, to].
 *
 * Exclusive at the start because a reset happening exactly at `from` has
 * already paid out; inclusive at the end so a plan that ends on a reset counts
 * that day.
 */
export function countDailyResets(from: Date, to: Date, utcOffset = AMERICA_UTC_OFFSET): number {
  if (to <= from) return 0;

  const hour = resetHourUtc(utcOffset);

  // The first reset instant strictly after `from`. The hour is negative on any
  // server ahead of UTC, which puts the candidate on an earlier UTC day, so it
  // is stepped forward by whole days rather than by one — see nextDailyReset.
  const candidate = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    hour,
    0,
    0,
    0,
  );
  const steps = Math.max(0, Math.floor((from.getTime() - candidate) / MS_PER_DAY) + 1);
  const firstAfter = candidate + steps * MS_PER_DAY;

  if (firstAfter > to.getTime()) return 0;
  return Math.floor((to.getTime() - firstAfter) / MS_PER_DAY) + 1;
}

/**
 * Monthly resets on `dayOfMonth`, in (from, to].
 *
 * Months without that day are skipped rather than rolled forward — there is no
 * 31st of February, and rolling would invent a reset on the 3rd of March.
 */
export function countMonthlyResets(
  from: Date,
  to: Date,
  dayOfMonth: number,
  utcOffset = AMERICA_UTC_OFFSET,
): number {
  if (to <= from) return 0;

  const hour = resetHourUtc(utcOffset);
  let count = 0;

  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  for (;;) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    if (dayOfMonth <= daysInMonth) {
      const instant = Date.UTC(year, month, dayOfMonth, hour, 0, 0, 0);
      if (instant > to.getTime()) break;
      if (instant > from.getTime()) count++;
    }

    month++;
    if (month > 11) {
      month = 0;
      year++;
    }

    // Cheap guard against a runaway loop on an absurd range.
    if (Date.UTC(year, month, 1) > to.getTime() + MS_PER_DAY * 62) break;
  }

  return count;
}

/** Which income sources to count. Everything defaults to off. */
export type IncomeToggles = {
  dailyCommissions?: boolean;
  welkin?: boolean;
  spiralAbyss?: boolean;
  imaginariumTheater?: boolean;
  events?: boolean;
  compensation?: boolean;
  exploration?: boolean;
  battlePass?: boolean;
  stardustFates?: boolean;
};

export type ProjectIncomeInput = {
  from: Date;
  to: Date;
  assumptions: IncomeAssumptions;
  enabled: IncomeToggles;
  /** Welkin days the player has left. Capped by the length of the range. */
  welkinDaysRemaining?: number;
  /** Share of the endgame reward the player expects to clear, 0 to 1. */
  endgameCompletion?: number;
  utcOffset?: number;
};

export type IncomeBreakdown = {
  dailyCommissions: number;
  welkin: number;
  spiralAbyss: number;
  imaginariumTheater: number;
  events: number;
  compensation: number;
  exploration: number;
  battlePass: number;
};

export type IncomeProjection = {
  /** Total primogems expected in the range. */
  primogems: number;
  /** Fates expected in the range, which are not bought with primogems. */
  fates: number;
  /** Daily resets in the range. */
  days: number;
  /** Welkin days actually paid out — min(remaining, days). */
  welkinDaysUsed: number;
  resets: { spiralAbyss: number; imaginariumTheater: number; monthly: number };
  breakdown: IncomeBreakdown;
};

export function projectIncome(input: ProjectIncomeInput): IncomeProjection {
  const {
    from,
    to,
    assumptions,
    enabled,
    welkinDaysRemaining = 0,
    endgameCompletion = 1,
    utcOffset = AMERICA_UTC_OFFSET,
  } = input;

  if (welkinDaysRemaining < 0) {
    throw new RangeError(`welkinDaysRemaining must be >= 0, got ${welkinDaysRemaining}`);
  }
  if (endgameCompletion < 0 || endgameCompletion > 1) {
    throw new RangeError(`endgameCompletion must be in [0, 1], got ${endgameCompletion}`);
  }
  if (assumptions.patchLengthDays <= 0) {
    throw new RangeError(`patchLengthDays must be > 0, got ${assumptions.patchLengthDays}`);
  }

  const days = countDailyResets(from, to, utcOffset);
  const abyssResets = countMonthlyResets(from, to, SPIRAL_ABYSS_RESET_DAY, utcOffset);
  const theaterResets = countMonthlyResets(from, to, IMAGINARIUM_THEATER_RESET_DAY, utcOffset);
  // The stardust shop refreshes on the 1st, like the Theater.
  const monthlyResets = theaterResets;

  const welkinDaysUsed = enabled.welkin ? Math.min(welkinDaysRemaining, days) : 0;
  const patchShare = days / assumptions.patchLengthDays;

  const breakdown: IncomeBreakdown = {
    dailyCommissions: enabled.dailyCommissions ? days * assumptions.dailyCommissions : 0,
    welkin: welkinDaysUsed * assumptions.welkinPerDay,
    spiralAbyss: enabled.spiralAbyss
      ? abyssResets * assumptions.spiralAbyssPerReset * endgameCompletion
      : 0,
    imaginariumTheater: enabled.imaginariumTheater
      ? theaterResets * assumptions.imaginariumTheaterPerReset * endgameCompletion
      : 0,
    events: enabled.events ? patchShare * assumptions.eventsPerPatch : 0,
    compensation: enabled.compensation ? patchShare * assumptions.compensationPerPatch : 0,
    exploration: enabled.exploration ? patchShare * assumptions.explorationPerPatch : 0,
    battlePass: enabled.battlePass ? patchShare * assumptions.battlePassPerPatch : 0,
  };

  const primogems = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  const fates =
    (enabled.battlePass ? patchShare * assumptions.battlePassFatesPerPatch : 0) +
    (enabled.stardustFates ? monthlyResets * assumptions.stardustFatesPerMonth : 0);

  return {
    primogems,
    fates,
    days,
    welkinDaysUsed,
    resets: { spiralAbyss: abyssResets, imaginariumTheater: theaterResets, monthly: monthlyResets },
    breakdown,
  };
}

export type BalancePoint = {
  /** Epoch ms. */
  at: number;
  /** Primogems held at that moment, starting balance included. */
  primogems: number;
};

export type BalanceCurveInput = ProjectIncomeInput & {
  /** What the player holds at `from`. */
  startingPrimogems: number;
  /** How many points to sample. More is smoother, not more accurate. */
  points?: number;
  /**
   * The player's own income figure, replacing the projected total.
   *
   * Spread over the period in the projection's shape rather than evenly: the
   * player is overriding *how much*, not *when* — income still arrives on
   * resets, so a straight line would be a different claim than the one they
   * made.
   */
  incomeOverride?: number | null;
};

/**
 * The primogem balance over time, for the line under the dial.
 *
 * Sampled rather than accumulated: each point is a full `projectIncome` from
 * `from` to that moment, so the curve is the same arithmetic the headline uses
 * and cannot drift from it. Income arrives on resets, so the real shape is a
 * staircase — the samples land wherever they land and the line reads as the
 * trend it is.
 */
export function projectBalanceCurve(input: BalanceCurveInput): BalancePoint[] {
  const { from, to, startingPrimogems, points = 32, incomeOverride } = input;
  const span = to.getTime() - from.getTime();

  if (span <= 0 || points < 2) {
    return [{ at: from.getTime(), primogems: startingPrimogems }];
  }

  const projected = projectIncome(input).primogems;
  // An override rescales the curve so it ends on the player's figure. Without
  // this the line would contradict the income the screen says it is using.
  const scale =
    incomeOverride === null || incomeOverride === undefined || projected <= 0
      ? 1
      : incomeOverride / projected;

  const curve: BalancePoint[] = [];
  for (let i = 0; i < points; i++) {
    const at = from.getTime() + (span * i) / (points - 1);
    const earned = i === 0 ? 0 : projectIncome({ ...input, to: new Date(at) }).primogems * scale;
    curve.push({ at, primogems: startingPrimogems + Math.floor(earned) });
  }

  // The last point is the answer the rest of the screen states, so it is set
  // rather than sampled — a rounding difference there would read as a bug.
  const total = incomeOverride ?? projected;
  curve[curve.length - 1] = {
    at: to.getTime(),
    primogems: startingPrimogems + Math.floor(total),
  };

  return curve;
}

export type PullsAvailableInput = {
  primogems: number;
  fates: number;
  projectedPrimogems?: number;
  projectedFates?: number;
};

/**
 * Pulls a player can make.
 *
 * `fates + floor((primogems + projected) / 160)` — floored, because 159
 * primogems is not a pull and the planner must never promise one it cannot
 * make. See docs/MATH.md section 3.
 */
export function pullsAvailable({
  primogems,
  fates,
  projectedPrimogems = 0,
  projectedFates = 0,
}: PullsAvailableInput): number {
  if (primogems < 0) throw new RangeError(`primogems must be >= 0, got ${primogems}`);
  if (fates < 0) throw new RangeError(`fates must be >= 0, got ${fates}`);
  if (projectedPrimogems < 0) {
    throw new RangeError(`projectedPrimogems must be >= 0, got ${projectedPrimogems}`);
  }
  if (projectedFates < 0) {
    throw new RangeError(`projectedFates must be >= 0, got ${projectedFates}`);
  }

  const totalPrimogems = primogems + projectedPrimogems;
  const totalFates = Math.floor(fates + projectedFates);
  return totalFates + Math.floor(totalPrimogems / PRIMOGEMS_PER_PULL.value);
}
