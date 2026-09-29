import { DEFAULT_ASSUMPTIONS, type IncomeAssumptions, type IncomeToggles } from '@/engine/income';

import { db, type Plan } from './schema';

/**
 * Reading and writing saved plans.
 *
 * Kept apart from the Dexie schema so callers depend on these functions rather
 * than on table shapes, and apart from React so they can be tested without one.
 */

/** Sources a new plan counts by default: everything a player gets for free. */
export const DEFAULT_TOGGLES: IncomeToggles = {
  dailyCommissions: true,
  welkin: false,
  spiralAbyss: true,
  imaginariumTheater: true,
  events: true,
  compensation: true,
  exploration: false,
  battlePass: false,
  stardustFates: false,
};

export type NewPlanInput = {
  name?: string;
  target?: string;
  targetDate?: string;
  constellation?: number;
  primogems?: number;
  fates?: number;
  pity?: number;
  guaranteed?: boolean;
  welkinDaysRemaining?: number;
  endgameCompletion?: number;
  balanceConfirmedAt?: number;
  incomeOverride?: number | null;
  assumptions?: IncomeAssumptions;
  enabled?: IncomeToggles;
};

function newId(): string {
  // crypto.randomUUID is unavailable on older Safari and in some test
  // environments, so fall back rather than throwing at plan creation.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `plan_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function makePlan(input: NewPlanInput = {}): Plan {
  const now = Date.now();
  return {
    id: newId(),
    name: input.name ?? 'New plan',
    target: input.target ?? '',
    targetDate: input.targetDate ?? '',
    constellation: input.constellation ?? 0,
    primogems: input.primogems ?? 0,
    fates: input.fates ?? 0,
    balanceConfirmedAt: input.balanceConfirmedAt ?? now,
    pity: input.pity ?? 0,
    guaranteed: input.guaranteed ?? false,
    welkinDaysRemaining: input.welkinDaysRemaining ?? 0,
    endgameCompletion: input.endgameCompletion ?? 1,
    incomeOverride: input.incomeOverride ?? null,
    assumptions: input.assumptions ?? { ...DEFAULT_ASSUMPTIONS },
    enabled: input.enabled ?? { ...DEFAULT_TOGGLES },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fills in fields added after a plan was stored.
 *
 * `balanceConfirmedAt` arrived with the ledger, so a plan written before it has
 * no anchor time. `updatedAt` stands in: it is the last moment the player
 * touched the plan at all, which is the shortest defensible window and so
 * credits the least income.
 */
function normalise(plan: Plan): Plan {
  return plan.balanceConfirmedAt
    ? plan
    : { ...plan, balanceConfirmedAt: plan.updatedAt || plan.createdAt };
}

/**
 * Plans, most recently updated first.
 *
 * `updatedAt` is millisecond-resolution, so several writes can land on the same
 * tick and leave "most recent" ambiguous — which would let the plan that opens
 * on load flip between reloads. Ties fall back to createdAt and then to id, so
 * the order is always total and stable.
 */
export async function listPlans(): Promise<Plan[]> {
  const plans = (await db.plans.toArray()).map(normalise);
  return plans.sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
}

export async function getPlan(id: string): Promise<Plan | undefined> {
  const plan = await db.plans.get(id);
  return plan ? normalise(plan) : undefined;
}

export async function savePlan(plan: Plan): Promise<Plan> {
  const stamped = { ...plan, updatedAt: Date.now() };
  await db.plans.put(stamped);
  return stamped;
}

export async function createPlan(input: NewPlanInput = {}): Promise<Plan> {
  const plan = makePlan(input);
  await db.plans.put(plan);
  return plan;
}

export async function deletePlan(id: string): Promise<void> {
  await db.plans.delete(id);
}

/**
 * The plan to open on load: most recently updated, or a fresh one.
 *
 * Creating on first run means the Plan screen always has something to render,
 * rather than an empty state that has to be designed twice.
 */
export async function loadOrCreateActivePlan(fallback: NewPlanInput = {}): Promise<Plan> {
  const plans = await listPlans();
  return plans[0] ?? createPlan(fallback);
}
