'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadOrCreateActivePlan, savePlan } from '@/db/plans';
import type { Plan } from '@/db/schema';
import { defaultTargetDate } from '@/engine/calendar/banners';
import { computePlan, type PlanResult } from '@/engine/wish/plan';

/**
 * Loads the active plan, holds it while the player edits, and writes it back.
 *
 * Results recompute synchronously on every change — SPEC's budget is 50ms and
 * the engine measures about 26ms at its worst — so the answer never lags behind
 * the input. Writes to IndexedDB are debounced instead, because a stepper held
 * down would otherwise fire a transaction per repeat.
 */

const SAVE_DEBOUNCE_MS = 400;

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
  plan: Plan | null;
  /** False until the stored plan has loaded, so the screen can hold still. */
  ready: boolean;
  result: PlanResult | null;
  update: (patch: Partial<Plan>) => void;
};

export function usePlan(now: Date = new Date()): UsePlan {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadOrCreateActivePlan(firstRunPlan()).then((loaded) => {
      if (cancelled) return;
      setPlan(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Plan>) => {
    setPlan((previous) => (previous ? { ...previous, ...patch } : previous));
  }, []);

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

  const result = useMemo(() => {
    if (!plan) return null;
    const to = plan.targetDate ? new Date(plan.targetDate) : now;
    return computePlan({
      primogems: plan.primogems,
      fates: plan.fates,
      pity: plan.pity,
      guaranteed: plan.guaranteed,
      constellation: plan.constellation,
      from: now,
      to,
      assumptions: plan.assumptions,
      enabled: plan.enabled,
      welkinDaysRemaining: plan.welkinDaysRemaining,
      endgameCompletion: plan.endgameCompletion,
      incomeOverride: plan.incomeOverride,
    });
    // `now` itself is intentionally not a dependency; `nowMs` stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, nowMs]);

  return { plan, ready, result, update };
}
