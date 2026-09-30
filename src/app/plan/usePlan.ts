'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createPlan, deletePlan, listPlans, makePlan, savePlan } from '@/db/plans';
import type { Plan } from '@/db/schema';
import { listWishes } from '@/db/wishes';
import { defaultTargetDate } from '@/engine/calendar/banners';
import { currentBalance, type CurrentBalance } from '@/engine/ledger';
import { AMERICA_UTC_OFFSET } from '@/engine/time';
import type { Wish } from '@/engine/wish/history';
import { readOr } from '@/lib/storage';
import { computePlan, type PlanResult } from '@/engine/wish/plan';

/**
 * Loads the active plan, holds it while the player edits, and writes it back.
 *
 * Results recompute synchronously on every change — SPEC's budget is 50ms and
 * the engine measures about 26ms at its worst — so the answer never lags behind
 * the input. Writes to IndexedDB are debounced instead, because a stepper held
 * down would otherwise fire a transaction per repeat.
 *
 * The stored primogems and fates are an *anchor* — what the player last
 * confirmed — not a running total. The balance the screen works from is derived
 * from that anchor plus income earned and pulls made since, so it stays right
 * without being retyped (src/engine/ledger). Typing a new figure re-anchors.
 */

const SAVE_DEBOUNCE_MS = 400;

/**
 * The plan to render before the stored one has loaded.
 *
 * Rendering the real screen from an empty plan, rather than an empty panel,
 * is what keeps the first paint stable: the column is its final height from
 * the start, so nothing below it moves when the stored values arrive, and the
 * hero numeral is a Largest Contentful Paint candidate immediately instead of
 * a second or two later. Both were costing real Lighthouse points.
 *
 * It is never written to storage — `loadOrCreateActivePlan` still decides what
 * a first run persists.
 *
 * Its default target date is the banner's end at America's reset. On another
 * server the real end is up to thirteen hours earlier, which can move the
 * projection by a single daily reset — immaterial against a plan spanning
 * weeks, and the player can change the date.
 */
const PROVISIONAL_PLAN: Plan = makePlan(firstRunPlan());

/** What a new plan starts as. Empty, so the screen invites the first input. */
function firstRunPlan() {
  const target = 'Skirk';
  const targetDate = defaultTargetDate(target);
  return {
    name: `${target} C0`,
    target,
    targetDate: targetDate ? targetDate.toISOString() : '',
  };
}

export type UsePlan = {
  /** Never null: an empty provisional plan stands in until the stored one lands. */
  plan: Plan;
  /** False until the stored plan has loaded, so the screen can hold still. */
  ready: boolean;
  result: PlanResult;
  /** The anchor carried forward to now. What the steppers show. */
  balance: CurrentBalance;
  update: (patch: Partial<Plan>) => void;
  /** Every saved plan, most recently updated first. */
  plans: Plan[];
  /** Switches to a saved plan, flushing whatever is pending on this one. */
  switchTo: (id: string) => void;
  /** Starts a fresh plan and makes it the active one. */
  addPlan: () => void;
  /** Deletes the active plan and falls back to the next one. */
  removePlan: () => void;
};

export function usePlan(now: Date = new Date(), utcOffset: number = AMERICA_UTC_OFFSET): UsePlan {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Both, before `ready`: a balance derived without the pull history would be
  // too high for a frame, and the hero numeral would visibly drop.
  useEffect(() => {
    let cancelled = false;
    // On a device that will not store anything the provisional plan is what
    // the player gets: every number still computes, nothing is remembered.
    void readOr(
      async (): Promise<[Plan[], Wish[]]> => {
        const stored = await listPlans();
        // A first run gets one plan rather than an empty switcher.
        const all = stored.length > 0 ? stored : [await createPlan(firstRunPlan())];
        return [all, await listWishes()];
      },
      [[], []] as [Plan[], Wish[]],
    ).then(([all, storedWishes]) => {
      if (cancelled) return;
      setPlans(all);
      if (all[0]) setPlan(all[0]);
      setWishes(storedWishes);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Typing a balance is a fresh confirmation, so it re-anchors.
   *
   * Without this the next load would add income on top of a figure that
   * already accounts for it, and the balance would climb away from the truth.
   */
  // Edits before the stored plan has arrived would be written onto the
  // provisional one and lost a few milliseconds later, so they are ignored.
  const update = useCallback((patch: Partial<Plan>) => {
    const reanchored =
      patch.primogems !== undefined || patch.fates !== undefined
        ? { ...patch, balanceConfirmedAt: Date.now() }
        : patch;
    setPlan((previous) => {
      if (!previous) return previous;
      const next = { ...previous, ...reanchored };
      // Keep the switcher's labels honest while the plan is being renamed.
      setPlans((all) => all.map((p) => (p.id === next.id ? next : p)));
      return next;
    });
  }, []);

  /**
   * Writes whatever is pending before leaving a plan.
   *
   * The debounced save is cancelled when `plan` changes, so switching without
   * this would silently drop the last 400ms of edits on the plan being left.
   */
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (plan) await savePlan(plan);
  }, [plan]);

  const switchTo = useCallback(
    (id: string) => {
      void (async () => {
        await flush();
        const stored = await listPlans();
        setPlans(stored);
        const found = stored.find((p) => p.id === id);
        if (found) setPlan(found);
      })();
    },
    [flush],
  );

  const addPlan = useCallback(() => {
    void (async () => {
      await flush();
      const created = await createPlan({ name: 'New plan' });
      setPlans(await listPlans());
      setPlan(created);
    })();
  }, [flush]);

  const removePlan = useCallback(() => {
    void (async () => {
      if (!plan) return;
      clearTimeout(saveTimer.current);
      await deletePlan(plan.id);

      const stored = await listPlans();
      // Never leave the screen with nothing to render.
      const remaining = stored.length > 0 ? stored : [await createPlan(firstRunPlan())];
      setPlans(remaining);
      setPlan(remaining[0]);
    })();
  }, [plan]);

  // Debounced write-back. The cleanup flushes nothing on unmount deliberately:
  // a pending edit is at most 400ms old, and writing during teardown races the
  // next mount's read.
  useEffect(() => {
    if (!ready || !plan) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void savePlan(plan);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
  }, [plan, ready]);

  // Depending on the instant rather than the Date object: a caller passing a
  // fresh `new Date()` each render would otherwise recompute every time.
  const nowMs = now.getTime();

  const effectivePlan = plan ?? PROVISIONAL_PLAN;

  const balance = useMemo(() => {
    return currentBalance({
      anchor: {
        primogems: effectivePlan.primogems,
        fates: effectivePlan.fates,
        at: effectivePlan.balanceConfirmedAt,
      },
      now,
      wishes,
      assumptions: effectivePlan.assumptions,
      enabled: effectivePlan.enabled,
      endgameCompletion: effectivePlan.endgameCompletion,
      utcOffset,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePlan, wishes, nowMs, utcOffset]);

  const result = useMemo(() => {
    /*
      Before the stored plan lands, the projection spans no time at all.
      `/plan` is prerendered, so a range ending at the target date would be
      measured from the *build* clock in the HTML and the visitor's on
      hydration — different numbers for the same markup. `ready` is false in
      both passes, so this is the one reading they agree on.
    */
    const to = ready && effectivePlan.targetDate ? new Date(effectivePlan.targetDate) : now;
    return computePlan({
      primogems: balance.primogems,
      fates: balance.fates,
      pity: effectivePlan.pity,
      guaranteed: effectivePlan.guaranteed,
      constellation: effectivePlan.constellation,
      from: now,
      to,
      assumptions: effectivePlan.assumptions,
      enabled: effectivePlan.enabled,
      welkinDaysRemaining: effectivePlan.welkinDaysRemaining,
      endgameCompletion: effectivePlan.endgameCompletion,
      incomeOverride: effectivePlan.incomeOverride,
      utcOffset,
    });
    // `now` itself is intentionally not a dependency; `nowMs` stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePlan, balance, nowMs, ready, utcOffset]);

  /*
    The stored list with the active plan's live edits folded in, so the
    switcher's label follows a rename as it is typed.

    Derived rather than kept in sync by hand. An earlier version updated the
    list from inside `setPlan`'s updater, which makes the updater impure —
    React may call it more than once — and the two pieces of state drifted
    apart under exactly that.
  */
  const planList = useMemo(
    () => plans.map((saved) => (plan && saved.id === plan.id ? plan : saved)),
    [plans, plan],
  );

  return {
    plan: effectivePlan,
    ready,
    result,
    balance,
    update,
    plans: planList,
    switchTo,
    addPlan,
    removePlan,
  };
}
