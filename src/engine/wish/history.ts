import { AMERICA_UTC_OFFSET } from '../time';
import { EXPECTED_PULLS_PER_5STAR } from './pity';

/**
 * Reading pity and the 50/50 out of imported wish history.
 *
 * The planner's two most important inputs — current pity and whether the next
 * 5-star is guaranteed — are both derivable from the pull log, so a player
 * should never have to count backwards by hand.
 *
 * See docs/DATA.md section 3.
 */

/** Banner codes as the gacha log reports them. */
export const BANNER_TYPES = {
  beginner: '100',
  standard: '200',
  character: '301',
  weapon: '302',
  /** The second character banner. It shares pity with 301. */
  character2: '400',
  chronicled: '500',
} as const;

/**
 * Both character banners draw on one pity counter, so they are always read
 * together. A player who pulled on 301 then 400 has one streak, not two.
 *
 * DATA.md flags 400 and 500 as needing confirmation against a real import,
 * which no synthetic fixture can provide.
 */
export const CHARACTER_BANNERS: string[] = [BANNER_TYPES.character, BANNER_TYPES.character2];

/**
 * Banners that spend Intertwined Fate, and so draw on the planner's budget.
 *
 * The beginner and standard banners take Acquaint Fate instead, which is not
 * part of a wish plan — counting those pulls would quietly shrink the balance.
 *
 *   Acquaint Fate is for Standard and Beginners' Wish:
 *     https://genshin-impact.fandom.com/wiki/Acquaint_Fate
 *   Chronicled Wish takes Intertwined Fate, “like in the limited Character
 *   Event-Wish banners and Epitome Invocation”:
 *     https://game8.co/games/Genshin-Impact/archives/446618
 *   verifiedAt: 2026-09-29
 */
export const INTERTWINED_BANNERS: string[] = [
  BANNER_TYPES.character,
  BANNER_TYPES.character2,
  BANNER_TYPES.weapon,
  BANNER_TYPES.chronicled,
];

/**
 * A gacha log timestamp as an instant.
 *
 * The API reports `2026-09-01 07:30:00` with no zone: it is the *server's*
 * local time, so an America account's 07:30 is 12:30 UTC. Reading it as UTC
 * would place every pull five hours early, which is enough to sort a pull onto
 * the wrong side of a reset or a confirmation.
 */
export function wishTimeMs(time: string, utcOffset = AMERICA_UTC_OFFSET): number {
  const parsed = wishTimeMsOrNull(time, utcOffset);
  if (parsed === null) throw new RangeError(`Unrecognised wish time: ${time}`);
  return parsed;
}

/**
 * The same, returning null instead of throwing.
 *
 * For callers that have to keep going: `time` is best-effort in wish-import,
 * which stores an empty string rather than dropping a pull whose other fields
 * are sound, so a single odd row must not take a screen down with it.
 */
export function wishTimeMsOrNull(time: string, utcOffset = AMERICA_UTC_OFFSET): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
    typeof time === 'string' ? time.trim() : '',
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour - utcOffset, minute, second);
}

/**
 * 5-star characters on the standard banner.
 *
 * A 5-star from a character banner is the featured one unless it is one of
 * these, which is how a lost 50/50 is recognised.
 *
 *   source: https://genshin-impact.fandom.com/wiki/Wanderlust_Invocation
 *   verifiedAt: 2026-09-29
 *
 * This list grows — Yumemizuki Mizuki was added in version 5.5 — so it will go
 * stale. When it does, a newly added standard character reads as a *win*, and
 * the planner then says 50/50 where the truth is guaranteed, understating the
 * odds. That is the safer direction to be wrong in, and the UI lets the player
 * correct it, but it is why the conclusion is always shown rather than applied
 * silently.
 */
export const STANDARD_5STAR_CHARACTERS: readonly string[] = [
  'Dehya',
  'Diluc',
  'Jean',
  'Keqing',
  'Mona',
  'Qiqi',
  'Tighnari',
  'Yumemizuki Mizuki',
];

const STANDARD_SET = new Set(STANDARD_5STAR_CHARACTERS.map((name) => name.toLowerCase()));

export function isStandardCharacter(name: string): boolean {
  return STANDARD_SET.has(name.trim().toLowerCase());
}

/** One row of the gacha log, narrowed to what we use. */
export type Wish = {
  id: string;
  gachaType: string;
  /** '3' | '4' | '5' as the API reports it. */
  rankType: string;
  itemType: string;
  name: string;
  time: string;
};

/** A 5-star, with how it was reached. */
export type FiveStarEvent = {
  name: string;
  /** Pulls it took, counting from the previous 5-star. */
  pity: number;
  featured: boolean;
  /** Whether the guarantee from an earlier loss was in play. */
  wasGuaranteed: boolean;
  time: string;
  id: string;
};

export type HistorySummary = {
  /** Pulls since the last 5-star. Feeds the planner directly. */
  pity: number;
  /** Whether the next 5-star is guaranteed featured. */
  guaranteed: boolean;
  totalPulls: number;
  fiveStars: FiveStarEvent[];
  /** Only 50/50s actually rolled — guaranteed pulls are not coin flips. */
  fiftyFiftyWins: number;
  fiftyFiftyLosses: number;
  /** Mean pulls per 5-star, against the model's 62.30. */
  averagePity: number | null;
  luckVersusExpected: number | null;
};

/**
 * Wish ids increase over time, so sorting by id gives chronological order
 * without trusting the `time` string, which has no timezone.
 */
export function sortChronologically(wishes: readonly Wish[]): Wish[] {
  return [...wishes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Merges imports, keeping one row per id so repeated imports extend history. */
export function mergeWishes(existing: readonly Wish[], incoming: readonly Wish[]): Wish[] {
  const byId = new Map<string, Wish>();
  for (const wish of existing) byId.set(wish.id, wish);
  for (const wish of incoming) byId.set(wish.id, wish);
  return sortChronologically([...byId.values()]);
}

/**
 * Walks the character-banner history and works out where the player stands.
 *
 * Pity counts every pull since the last 5-star. The guarantee follows the
 * game's rule: losing a 50/50 guarantees the next 5-star is featured, and that
 * guaranteed pull is not itself a coin flip — so it is excluded from the
 * 50/50 record, which would otherwise read as luckier than it was.
 */
export function summariseCharacterHistory(wishes: readonly Wish[]): HistorySummary {
  const pulls = sortChronologically(
    wishes.filter((wish) => CHARACTER_BANNERS.includes(wish.gachaType)),
  );

  const fiveStars: FiveStarEvent[] = [];
  let pity = 0;
  let guaranteed = false;
  let wins = 0;
  let losses = 0;

  for (const wish of pulls) {
    pity++;
    if (wish.rankType !== '5') continue;

    const featured = !isStandardCharacter(wish.name);
    fiveStars.push({
      name: wish.name,
      pity,
      featured,
      wasGuaranteed: guaranteed,
      time: wish.time,
      id: wish.id,
    });

    if (guaranteed) {
      // Cashing in a guarantee. Not a 50/50, so it is not recorded as one —
      // counting it as a win is what inflates every naive luck tracker.
      guaranteed = false;
    } else if (featured) {
      wins++;
    } else {
      losses++;
      guaranteed = true;
    }

    pity = 0;
  }

  const averagePity =
    fiveStars.length > 0
      ? fiveStars.reduce((sum, event) => sum + event.pity, 0) / fiveStars.length
      : null;

  return {
    pity,
    guaranteed,
    totalPulls: pulls.length,
    fiveStars,
    fiftyFiftyWins: wins,
    fiftyFiftyLosses: losses,
    averagePity,
    // Below 1 is luckier than the model expects, above 1 is unluckier.
    luckVersusExpected: averagePity === null ? null : averagePity / EXPECTED_PULLS_PER_5STAR,
  };
}
