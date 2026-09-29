import { HARD_PITY, p5Char } from './pity';

/**
 * Character event banner: the chance of reaching a constellation goal.
 *
 * Two things decide whether a 5-star is the character you want. Pity decides
 * when a 5-star arrives (see pity.ts); the 50/50 decides whether it is the
 * featured one. This module folds both into a CDF over pulls.
 *
 * The 50/50 rule, including Capturing Radiance:
 *   A 5-star from the event banner has a 55% consolidated chance of being the
 *   featured character. Losing the 50/50 guarantees the next one. Capturing
 *   Radiance does not create a guarantee; a plain loss still does.
 *   source: https://genshin-impact.fandom.com/f/p/4400000000000461675
 *   source: https://game8.co/games/Genshin-Impact/archives/468191
 *   verifiedAt: 2026-09-28
 *   see also docs/MATH.md section 1
 *
 * Community write-ups describe a hidden loss counter that makes Capturing
 * Radiance more likely after repeated losses. They disagree on the details and
 * none of it is official, so the shipped model is the published 55% and nothing
 * more. FiftyFiftyModel exists so a better one can replace it without touching
 * the DP.
 */

/** What a resolved 5-star turned out to be. */
export type FiftyFiftyOutcome = 'featured' | 'lost';

/**
 * A 50/50 rule.
 *
 * `states` must be finite and complete, because featuredCdf enumerates it to
 * build the DP. A model with hidden state (a loss counter, say) lists every
 * value that state can take.
 *
 * Note: this splits a 5-star into featured or lost, and does not distinguish a
 * natural win from a Capturing Radiance trigger. A future counter model that
 * needs that distinction will need another hook. No published data supports one
 * yet, so inventing the API now would be guessing.
 */
export interface FiftyFiftyModel<S = unknown> {
  readonly id: string;
  readonly label: string;
  /** Every state the model can occupy, in a stable order. */
  readonly states: readonly S[];
  /** Starting state for a player who is, or is not, on a guarantee. */
  initial(guaranteed: boolean): S;
  /** Chance the next 5-star is the featured character. */
  featuredChance(state: S): number;
  /** State after a 5-star resolves. */
  next(state: S, outcome: FiftyFiftyOutcome): S;
  /** Position of a state in `states`. */
  indexOf(state: S): number;
}

/** The two states the published rule needs: on a guarantee, or not. */
export type Consolidated55State = 'fifty' | 'guaranteed';

/** Official consolidated chance that a non-guaranteed 5-star is featured. */
export const CONSOLIDATED_FEATURED_RATE = 0.55;

/**
 * The shipped 50/50 model: a flat 55%, with a guarantee after a loss.
 *
 * Stateless beyond that flag — it has no memory of how many 50/50s you have
 * lost, because HoYoverse has not published one.
 */
export const consolidated55: FiftyFiftyModel<Consolidated55State> = {
  id: 'consolidated55',
  label: 'Official 55% consolidated rate',
  states: ['fifty', 'guaranteed'] as const,

  initial: (guaranteed) => (guaranteed ? 'guaranteed' : 'fifty'),

  featuredChance: (state) => (state === 'guaranteed' ? 1 : CONSOLIDATED_FEATURED_RATE),

  // A featured 5-star always puts you back on the 50/50. A loss guarantees the
  // next one.
  next: (_state, outcome) => (outcome === 'featured' ? 'fifty' : 'guaranteed'),

  indexOf: (state) => (state === 'guaranteed' ? 1 : 0),
};

/** Highest constellation the planner models: C6 is seven copies. */
export const MAX_COPIES = 7;

/**
 * Pulls after which the goal is certain.
 *
 * Worst case is a lost 50/50 before every copy, so each copy costs two 5-stars
 * rather than one — the guarantee clears again after each featured pull. A
 * player already on a guarantee saves exactly one of those 5-stars.
 *
 * docs/MATH.md gave `(90 - pity) + 90 * copies`, which assumes a single lost
 * 50/50 across the whole run. That is right for one copy by coincidence and too
 * short from two copies up: at C6 it says 720 pulls where the true bound is
 * 1,260, which would silently truncate the CDF.
 */
export function exhaustionBound(pity: number, copies: number, guaranteed: boolean): number {
  const fiveStars = 2 * copies - (guaranteed ? 1 : 0);
  return HARD_PITY * fiveStars - pity;
}

export type FeaturedCdfOptions<S = unknown> = {
  /** Pulls since the last 5-star, 0 to 89. */
  pity?: number;
  /** Whether the next 5-star is already guaranteed to be featured. */
  guaranteed?: boolean;
  /** Copies wanted: 1 is C0, 7 is C6. */
  copies?: number;
  /** Defaults to the exhaustion bound, so the curve always ends at certainty. */
  maxPulls?: number;
  model?: FiftyFiftyModel<S>;
};

/**
 * Chance of holding `copies` of the featured character within t pulls.
 *
 * Returns a Float64Array indexed by pulls: `cdf[t]` is that chance, `cdf[0]` is
 * 0, and the curve is non-decreasing.
 *
 * Forward DP over (copies so far, model state, pity). That is at most
 * 7 x |states| x 90 cells per pull, which runs in a few milliseconds over the
 * full range — no worker needed.
 */
export function featuredCdf<S>(options: FeaturedCdfOptions<S> = {}): Float64Array {
  const {
    pity = 0,
    guaranteed = false,
    copies = 1,
    model = consolidated55 as unknown as FiftyFiftyModel<S>,
    maxPulls = exhaustionBound(pity, copies, guaranteed),
  } = options;

  if (!Number.isInteger(pity) || pity < 0 || pity >= HARD_PITY) {
    throw new RangeError(`pity must be an integer in [0, ${HARD_PITY - 1}], got ${pity}`);
  }
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) {
    throw new RangeError(`copies must be an integer in [1, ${MAX_COPIES}], got ${copies}`);
  }
  if (!Number.isInteger(maxPulls) || maxPulls < 0) {
    throw new RangeError(`maxPulls must be a non-negative integer, got ${maxPulls}`);
  }

  const stateCount = model.states.length;

  // mass[copiesSoFar][stateIndex][pity]
  const emptyLayer = () =>
    Array.from({ length: copies }, () =>
      Array.from({ length: stateCount }, () => new Float64Array(HARD_PITY)),
    );

  let current = emptyLayer();
  current[0][model.indexOf(model.initial(guaranteed))][pity] = 1;

  const cdf = new Float64Array(maxPulls + 1);
  let reached = 0;

  for (let t = 1; t <= maxPulls; t++) {
    const nextLayer = emptyLayer();

    for (let got = 0; got < copies; got++) {
      for (let s = 0; s < stateCount; s++) {
        const row = current[got][s];
        const state = model.states[s];
        const featuredChance = model.featuredChance(state);
        const onFeatured = model.indexOf(model.next(state, 'featured'));
        const onLost = model.indexOf(model.next(state, 'lost'));

        for (let q = 0; q < HARD_PITY; q++) {
          const mass = row[q];
          if (mass === 0) continue;

          const fiveStar = p5Char(q + 1);

          // No 5-star: pity advances by one.
          if (fiveStar < 1) nextLayer[got][s][q + 1] += mass * (1 - fiveStar);

          const hit = mass * fiveStar;
          if (hit === 0) continue;

          // Featured: one more copy, pity resets.
          const featured = hit * featuredChance;
          if (featured > 0) {
            if (got + 1 >= copies) reached += featured;
            else nextLayer[got + 1][onFeatured][0] += featured;
          }

          // Lost: no copy, pity resets, the model decides the new state.
          const lost = hit * (1 - featuredChance);
          if (lost > 0) nextLayer[got][onLost][0] += lost;
        }
      }
    }

    current = nextLayer;
    cdf[t] = reached;
  }

  return cdf;
}

/**
 * Fewest pulls that reach `quantile` odds, or null if the curve never does.
 *
 * Null rather than -1 on purpose. design/preview.html uses
 * `cdf.findIndex(v => v >= 0.9)`, which returns -1 when the odds are out of
 * reach within maxPulls, and -1 then flows straight into the UI as a pull
 * count. Returning null forces the caller to handle it.
 */
export function pullsForQuantile(
  cdf: Float64Array | readonly number[],
  quantile: number,
): number | null {
  if (!(quantile > 0) || quantile > 1) {
    throw new RangeError(`quantile must be in (0, 1], got ${quantile}`);
  }

  for (let t = 0; t < cdf.length; t++) {
    if (cdf[t] >= quantile) return t;
  }
  return null;
}
