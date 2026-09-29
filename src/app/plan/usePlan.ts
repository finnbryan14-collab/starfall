'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadOrCreateActivePlan, savePlan } from '@/db/plans';
import type { Plan } from '@/db/schema';
import { listWishes } from '@/db/wishes';
import { defaultTargetDate } from '@/engine/calendar/banners';
import { currentBalance, type CurrentBalance } from '@/engine/ledger';
import type { Wish } from '@/engine/wish/history';
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
  /** The anchor carried forward to now. What the steppers show. */
  balance: CurrentBalance | null;
  update: (patch: Partial<Plan>) => void;
};

export function usePlan(now: Date = new Date()): UsePlan {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Both, before `ready`: a balance derived without the pull history would be
  // too high for a frame, and the hero numeral would visibly drop.
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadOrCreateActivePlan(firstRunPlan()), listWishes()]).then(
      ([loaded, storedWishes]) => {
        if (cancelled) return;
        setPlan(loaded);
        setWishes(storedWishes);
        setReady(true);
      },
    );
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
  const update = useCallback((patch: Partial<Plan>) => {
    const reanchored =
      patch.primogems !== undefined || patch.fates !== undefined
        ? { ...patch, balanceConfirmedAt: Date.now() }
        : patch;
    setPlan((previous) => (previous ? { ...previous, ...reanchored } : previous));
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

  const balance = useMemo(() => {
    if (!plan) return null;
    return currentBalance({
      anchor: {
        primogems: plan.primogems,
        fates: plan.fates,
        at: plan.balanceConfirmedAt,
      },
      now,
      wishes,
      assumptions: plan.assumptions,
      enabled: plan.enabled,
      endgameCompletion: plan.endgameCompletion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, wishes, nowMs]);

  const result = useMemo(() => {
    if (!plan || !balance) return null;
    const to = plan.targetDate ? new Date(plan.targetDate) : now;
    return computePlan({
      primogems: balance.primogems,
      fates: balance.fates,
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
  }, [plan, balance, nowMs]);

  return { plan, ready, result, balance, update };
}
