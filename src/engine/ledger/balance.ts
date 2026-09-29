import {
  PRIMOGEMS_PER_PULL,
  projectIncome,
  type IncomeAssumptions,
  type IncomeToggles,
} from '../income';
import { AMERICA_UTC_OFFSET, MS_PER_DAY } from '../time';
import { INTERTWINED_BANNERS, wishTimeMsOrNull, type Wish } from '../wish/history';

/**
 * Keeping the planner's balance current between confirmations.
 *
 * No API reports a primogem balance — checked Enka, the Battle Chronicle and
 * the Traveler's Diary (docs/DECISIONS.md) — so the number has to be typed at
 * least once. After that it need not be typed again: what the player earns is
 * the projection we already run forwards, and what they spend is in the wish
 * history we already import.
 *
 *   balance now = confirmed + income(confirmed → now) − pulls since × 160
 *
 * The confirmation is an anchor, never overwritten. Everything shown is derived
 * from it, so the arithmetic is reproducible and a wrong answer is traceable to
 * either the anchor or the income assumptions rather than to a value that has
 * been quietly mutated a dozen times.
 *
 * docs/MATH.md section 3.
 */

/** One Intertwined Fate, in primogems. */
export const PRIMOGEMS_PER_FATE = PRIMOGEMS_PER_PULL.value;

export type BalanceAnchor = {
  /** Primogems the player confirmed holding. */
  primogems: number;
  /** Intertwined Fates they confirmed holding. */
  fates: number;
  /** Epoch ms of the confirmation. */
  at: number;
};

export type BalanceInput = {
  anchor: BalanceAnchor;
  now: Date;
  /** The whole history; only Intertwined pulls after the anchor are counted. */
  wishes: readonly Wish[];
  assumptions: IncomeAssumptions;
  enabled: IncomeToggles;
  endgameCompletion?: number;
  utcOffset?: number;
};

export type CurrentBalance = {
  primogems: number;
  fates: number;
  /** Income credited for the window, rounded down. */
  earnedPrimogems: number;
  earnedFates: number;
  /** Intertwined-fate pulls made since the confirmation. */
  pullsSince: number;
  /** Primogems those pulls cost once the fates ran out. */
  spentPrimogems: number;
  /** Whole days since the confirmation. */
  ageDays: number;
  /** The spend outran the anchor plus income, so the anchor is wrong. */
  overdrawn: boolean;
};

export function currentBalance(input: BalanceInput): CurrentBalance {
  const {
    anchor,
    now,
    wishes,
    assumptions,
    enabled,
    endgameCompletion = 1,
    utcOffset = AMERICA_UTC_OFFSET,
  } = input;

  const elapsed = Math.max(0, now.getTime() - anchor.at);
  const ageDays = Math.floor(elapsed / MS_PER_DAY);

  const income = projectIncome({
    from: new Date(anchor.at),
    to: now,
    assumptions,
    enabled,
    // The plan stores Welkin days remaining from *now*. Over a window that has
    // already passed the player plainly had at least that many, so the window
    // is paid in full; projectIncome caps this at the resets it actually finds.
    welkinDaysRemaining: Math.ceil(elapsed / MS_PER_DAY) + 1,
    endgameCompletion,
    utcOffset,
  });

  // Rounded down, so a derived balance never promises primogems that are not
  // there. Over-stating it would push the odds up on a pull the player cannot
  // actually afford, which is the one direction this must not be wrong in.
  const earnedPrimogems = Math.floor(income.primogems);
  const earnedFates = Math.floor(income.fates);

  // A pull whose timestamp will not parse counts as spent. Both readings are
  // guesses, but assuming it was spent understates the balance, and understating
  // it only costs a pull the player turns out to be able to afford — overstating
  // it promises one they cannot.
  const pullsSince = wishes.filter((wish) => {
    if (!INTERTWINED_BANNERS.includes(wish.gachaType)) return false;
    const at = wishTimeMsOrNull(wish.time, utcOffset);
    return at === null || at > anchor.at;
  }).length;

  // Wishing spends fates first; the game only converts primogems when they run
  // out, at a fixed 160 each.
  const fatesAvailable = anchor.fates + earnedFates;
  const fatesSpent = Math.min(fatesAvailable, pullsSince);
  const spentPrimogems = (pullsSince - fatesSpent) * PRIMOGEMS_PER_FATE;

  const primogemsBefore = anchor.primogems + earnedPrimogems;

  return {
    primogems: Math.max(0, primogemsBefore - spentPrimogems),
    fates: fatesAvailable - fatesSpent,
    earnedPrimogems,
    earnedFates,
    pullsSince,
    spentPrimogems,
    ageDays,
    overdrawn: spentPrimogems > primogemsBefore,
  };
}
