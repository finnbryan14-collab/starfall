import {
  PRIMOGEMS_PER_PULL,
  projectIncome,
  pullsAvailable,
  type IncomeAssumptions,
  type IncomeProjection,
  type IncomeToggles,
} from '../income';
import { consolidated55, featuredCdfs, pullsForQuantile, type FiftyFiftyModel } from './featured';
import { MAX_COPIES } from './featured';

/**
 * The whole Plan screen answer, in one pure function.
 *
 * Ties pity, the 50/50 and projected income together so the component holds no
 * maths (CLAUDE.md). Everything the screen renders comes out of here.
 */

/** Odds the screen offers as targets, per SPEC.md. */
export const QUANTILES = [0.5, 0.75, 0.9] as const;

export type PlanInput = {
  primogems: number;
  fates: number;
  pity: number;
  guaranteed: boolean;
  /** 0 is C0, 6 is C6. */
  constellation: number;
  from: Date;
  to: Date;
  assumptions: IncomeAssumptions;
  enabled: IncomeToggles;
  welkinDaysRemaining?: number;
  endgameCompletion?: number;
  utcOffset?: number;
  model?: FiftyFiftyModel;
  /**
   * Replaces the projected primogem income when set.
   *
   * design/preview.html puts income on the ledger as a directly editable
   * number; SPEC.md has it come from the assumptions sheet. Both are true here:
   * the projection seeds the figure, and typing over it pins an override until
   * the sheet clears it. A player who knows their patch better than our
   * event midpoint should not have to argue with the model.
   */
  incomeOverride?: number | null;
};

export type ConstellationChance = {
  /** 0 is C0. */
  constellation: number;
  label: string;
  copies: number;
  chance: number;
};

export type QuantileTarget = {
  quantile: number;
  /** Pulls needed, or null if the goal cannot reach these odds at all. */
  pulls: number | null;
  /** Extra pulls beyond what the player will have. 0 once already past. */
  morePulls: number;
  /** Those extra pulls priced in primogems. */
  morePrimogems: number;
  reached: boolean;
};

export type PlanResult = {
  /** Pulls the player will have by the target date. */
  pulls: number;
  income: IncomeProjection;
  /** Primogem income actually used: the projection, or the override. */
  projectedPrimogems: number;
  incomeIsOverridden: boolean;
  /** Chance of the chosen constellation goal. The big answer. */
  chance: number;
  /** C0 up to the goal, for the constellation row. */
  constellations: ConstellationChance[];
  /** Full curve for the Fate Dial, indexed by pulls. */
  curve: Float64Array;
  /** Every curve from C0 to the goal, for a future stacked view. */
  curves: Float64Array[];
  targets: QuantileTarget[];
};

/** `constellation` 0 means one copy. */
export const copiesFor = (constellation: number) => constellation + 1;

export function computePlan(input: PlanInput): PlanResult {
  const {
    primogems,
    fates,
    pity,
    guaranteed,
    constellation,
    from,
    to,
    assumptions,
    enabled,
    welkinDaysRemaining = 0,
    endgameCompletion = 1,
    utcOffset,
    model = consolidated55,
    incomeOverride = null,
  } = input;

  if (!Number.isInteger(constellation) || constellation < 0 || constellation > MAX_COPIES - 1) {
    throw new RangeError(`constellation must be an integer in [0, ${MAX_COPIES - 1}]`);
  }

  const income = projectIncome({
    from,
    to,
    assumptions,
    enabled,
    welkinDaysRemaining,
    endgameCompletion,
    utcOffset,
  });

  if (incomeOverride !== null && incomeOverride < 0) {
    throw new RangeError(`incomeOverride must be >= 0, got ${incomeOverride}`);
  }
  const projectedPrimogems = incomeOverride ?? income.primogems;

  const pulls = pullsAvailable({
    primogems,
    fates,
    projectedPrimogems,
    projectedFates: income.fates,
  });

  const maxCopies = copiesFor(constellation);
  const curves = featuredCdfs({ pity, guaranteed, maxCopies, model });

  // Past the exhaustion bound the chance is 1 and stays there, so clamping the
  // lookup is exact rather than an approximation.
  const at = (curve: Float64Array) => curve[Math.min(pulls, curve.length - 1)];

  const constellations: ConstellationChance[] = curves.map((curve, index) => ({
    constellation: index,
    label: `C${index}`,
    copies: index + 1,
    chance: at(curve),
  }));

  const goalCurve = curves[maxCopies - 1];

  const targets: QuantileTarget[] = QUANTILES.map((quantile) => {
    const needed = pullsForQuantile(goalCurve, quantile);
    if (needed === null) {
      return { quantile, pulls: null, morePulls: 0, morePrimogems: 0, reached: false };
    }
    const morePulls = Math.max(0, needed - pulls);
    return {
      quantile,
      pulls: needed,
      morePulls,
      morePrimogems: morePulls * PRIMOGEMS_PER_PULL.value,
      reached: pulls >= needed,
    };
  });

  return {
    pulls,
    income,
    projectedPrimogems,
    incomeIsOverridden: incomeOverride !== null,
    chance: at(goalCurve),
    constellations,
    curve: goalCurve,
    curves,
    targets,
  };
}
