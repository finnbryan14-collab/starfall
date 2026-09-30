'use client';

import { useMemo, useRef, useState } from 'react';

import { BalanceLine } from '@/components/BalanceLine';
import { FateDial } from '@/components/FateDial';
import screen from '@/components/screen.module.css';
import fieldStyles from '@/components/ui/FieldRow.module.css';
import { AnswerBlock, FieldRow, SegmentedControl, StepperRow } from '@/components/ui';
import { defaultTargetDate, findCharacter, scheduledCharacters } from '@/engine/calendar/banners';
import { projectBalanceCurve } from '@/engine/income';
import { MAX_COPIES } from '@/engine/wish/featured';
import { formatNumber, formatPercent } from '@/lib/format';
import { useAccountServer } from '@/lib/use-account-server';

import { IncomeSheet } from './IncomeSheet';
import { usePlan } from './usePlan';

/**
 * The wish planner.
 *
 * All the maths lives in computePlan; this renders it (CLAUDE.md). The Fate
 * Dial lands in the next task, so its footprint is reserved rather than faked.
 */

/** Rounded for the constellation row, but never to a misleading 0% or 100%. */
function shortPercent(chance: number): string {
  if (chance >= 0.995 && chance < 1) return '>99%';
  if (chance > 0 && chance < 0.005) return '<1%';
  return `${Math.round(chance * 100)}%`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/**
 * What the plan switcher calls a plan.
 *
 * A constellation only belongs on a character — "Skirk C1" is how anyone would
 * say it, while "Save for 7.2 C0" is not something a person would write down.
 */
function planName(target: string, constellation: number): string {
  if (!target) return 'New plan';
  return findCharacter(target) ? `${target} C${constellation}` : target;
}

export function PlanScreen() {
  // One clock reading per mount, so the projection does not shift under the
  // animation while the player is reading it.
  const now = useMemo(() => new Date(), []);
  // Every reset in the projection is on server time, which comes from the
  // imported UID (src/lib/use-account-server.ts).
  const { utcOffset } = useAccountServer();
  const { plan, ready, result, balance, update, plans, switchTo, addPlan, removePlan } = usePlan(
    now,
    utcOffset,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  // The chart drives the numeral, so the redraw and the count are one moment.
  const numeralRef = useRef<HTMLSpanElement>(null);

  const targetDate = plan.targetDate ? new Date(plan.targetDate) : null;
  const dateLabel = targetDate ? DATE_FORMAT.format(targetDate) : null;
  const title = plan.target
    ? dateLabel
      ? `${plan.target} until ${dateLabel}`
      : plan.target
    : 'Your next pull';

  const ninety = result.targets.find((t) => t.quantile === 0.9);
  const empty = result.pulls === 0;
  // A stored plan outlives its banner. Once the date is behind us the income
  // projection is legitimately zero, which reads as a bug unless it is said.
  // Gated on `ready` for the same reason the projection is: the prerendered
  // HTML carries the build clock, and this must read the same in both passes.
  const datePassed = ready && targetDate !== null && targetDate.getTime() <= now.getTime();

  const confirmedLabel = DATE_FORMAT.format(new Date(plan.balanceConfirmedAt));

  const targetMs = targetDate?.getTime() ?? null;
  const balanceCurve = useMemo(
    () =>
      projectBalanceCurve({
        from: now,
        to: targetDate ?? now,
        startingPrimogems: balance.primogems,
        assumptions: plan.assumptions,
        enabled: plan.enabled,
        welkinDaysRemaining: plan.welkinDaysRemaining,
        endgameCompletion: plan.endgameCompletion,
        incomeOverride: plan.incomeOverride,
        utcOffset,
      }),
    // Depends on the instant rather than the Date object, so a fresh one each
    // render does not redraw the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, targetMs, balance.primogems, plan, utcOffset],
  );

  /** Every 5★ the calendar has ever seen, for the target list. */
  const characters = useMemo(() => scheduledCharacters().sort((a, b) => a.localeCompare(b)), []);
  const upcoming = useMemo(
    () => (plan.target ? defaultTargetDate(plan.target, now, utcOffset) : null),
    [plan.target, now, utcOffset],
  );

  /**
   * Changing who you are pulling for moves the date to their banner.
   *
   * Always, rather than only when the date is untouched: the date is right
   * there and editable, so a wrong-but-visible default is easy to correct,
   * while silently keeping the previous character's date is not.
   */
  function retarget(target: string) {
    const banner = defaultTargetDate(target, now, utcOffset);
    update({
      target,
      name: planName(target, plan.constellation),
      ...(banner ? { targetDate: banner.toISOString() } : {}),
    });
  }

  /** A date input gives `YYYY-MM-DD`; the plan stores an instant. */
  function setTargetDate(date: string) {
    if (!date) {
      update({ targetDate: '' });
      return;
    }
    const [year, month, day] = date.split('-').map(Number);
    update({ targetDate: new Date(Date.UTC(year, month - 1, day, 12)).toISOString() });
  }
  // Nothing to explain until the derived balance differs from what was typed.
  const ledgerMoved = balance.earnedPrimogems > 0 || balance.pullsSince > 0;

  return (
    /*
      Rendered in full from the first paint, from an empty plan until the
      stored one arrives. An empty busy panel held nothing still: the column
      grew by its own height when the data landed, and the hero numeral only
      became a paint candidate after hydration. `aria-busy` still says the
      values are provisional.
    */
    <section className={screen.panel} aria-labelledby="plan-title" aria-busy={!ready}>
      <div>
        <AnswerBlock
          title={title}
          titleId="plan-title"
          value={formatPercent(result.chance)}
          unit="%"
          valueLabel={`${formatPercent(result.chance)} percent`}
          valueRef={numeralRef}
        >
          {empty ? (
            <>Add your primogems to see your odds.</>
          ) : (
            <>
              chance you get {plan.constellation > 0 ? `C${plan.constellation}` : 'them'}
              {dateLabel ? ` by ${dateLabel}` : ''}, with the{' '}
              <strong>{formatNumber(result.pulls)}</strong> pulls you&rsquo;ll have.
            </>
          )}
        </AnswerBlock>

        <FateDial
          curve={result.curve}
          pulls={result.pulls}
          chance={result.chance}
          numeralRef={numeralRef}
          target={plan.target || undefined}
        />

        {/* SPEC section 1: the balance by date, as a small line under the dial. */}
        <BalanceLine curve={balanceCurve} targetLabel={dateLabel} />

        <ul className={screen.cons} aria-label="Chance by constellation">
          {result.constellations.map((c) => (
            <li key={c.label}>
              {/* Faded in proportion to its chance, as the preview does. */}
              <span
                className={screen.star}
                aria-hidden="true"
                style={{ opacity: (0.25 + 0.75 * c.chance).toFixed(2) }}
              >
                ★
              </span>
              {c.label} <b>{shortPercent(c.chance)}</b>
            </li>
          ))}
        </ul>

        {!empty && ninety ? (
          <p className={screen.hint}>
            {ninety.pulls === null ? (
              <>Even a full banner cannot get this goal to 90% odds.</>
            ) : ninety.reached ? (
              <>
                You&rsquo;re past 90% odds with {formatNumber(result.pulls - ninety.pulls)} pulls to
                spare.
              </>
            ) : (
              <>
                {formatNumber(ninety.morePulls)} more {ninety.morePulls === 1 ? 'pull' : 'pulls'} (
                {formatNumber(ninety.morePrimogems)} primogems) gets you to 90% odds.
              </>
            )}
          </p>
        ) : null}

        {datePassed ? (
          <p className={screen.hint}>
            {dateLabel} has passed, so this counts only what you hold now. Pick a later date to add
            the income you&rsquo;ll earn.
          </p>
        ) : null}
      </div>

      <div className={screen.colSide}>
        <h2 className={screen.sec}>Who and when</h2>
        <div className={screen.ledger}>
          {/*
            Shown once there is more than one, so a first run is not asked to
            understand a concept it does not have yet.
          */}
          {plans.length > 1 ? (
            <FieldRow label="Plan" htmlFor="plan-switcher" note={`${plans.length} saved`}>
              <select
                id="plan-switcher"
                className={fieldStyles.input}
                value={plan.id}
                onChange={(event) => switchTo(event.target.value)}
              >
                {plans.map((saved) => (
                  <option key={saved.id} value={saved.id}>
                    {saved.name || 'Untitled plan'}
                  </option>
                ))}
              </select>
            </FieldRow>
          ) : null}

          <FieldRow
            label="Target"
            htmlFor="plan-target"
            note="Any 5★, or whatever you're saving for"
          >
            <input
              id="plan-target"
              className={fieldStyles.input}
              type="text"
              autoComplete="off"
              list="plan-characters"
              placeholder="Who are you pulling for?"
              value={plan.target}
              onChange={(event) => retarget(event.target.value)}
            />
          </FieldRow>
          {/*
            A list rather than a select: the calendar knows every 5★ that has
            ever been featured, but "save for 7.2" is a perfectly good target
            too, so free text has to keep working.
          */}
          <datalist id="plan-characters">
            {characters.map((character) => (
              <option key={character} value={character} />
            ))}
          </datalist>

          <FieldRow
            label="By"
            htmlFor="plan-date"
            note={
              upcoming
                ? `Their banner ends ${DATE_FORMAT.format(upcoming)}`
                : 'How long you have to save'
            }
          >
            <input
              id="plan-date"
              className={fieldStyles.input}
              type="date"
              value={plan.targetDate ? plan.targetDate.slice(0, 10) : ''}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </FieldRow>
        </div>

        <h2 className={screen.sec}>Your stash</h2>
        <div className={screen.ledger}>
          <StepperRow
            label="Primogems"
            value={balance.primogems}
            onChange={(primogems) => update({ primogems })}
            step={160}
          />
          <StepperRow
            label="Intertwined Fates"
            value={balance.fates}
            onChange={(fates) => update({ fates })}
            max={9_999}
          />
          <StepperRow
            label="Pity"
            note="Pulls since your last 5★"
            value={plan.pity}
            onChange={(pity) => update({ pity })}
            max={89}
            valueText={(v) => `${v} pulls since your last 5-star`}
          />

          <div className={screen.row}>
            <span className={screen.rowLabel} id="guarantee-label">
              Next 5★
            </span>
            <SegmentedControl
              label="Next 5★"
              value={plan.guaranteed ? 'guaranteed' : 'fifty'}
              onChange={(value) => update({ guaranteed: value === 'guaranteed' })}
              options={[
                { value: 'fifty', label: '50/50' },
                { value: 'guaranteed', label: 'Guaranteed' },
              ]}
            />
          </div>

          <StepperRow
            label="Constellation goal"
            note="How many copies you want"
            value={plan.constellation}
            onChange={(constellation) =>
              update({
                constellation,
                // The switcher labels plans by name, and a name nobody typed
                // is better than "New plan" three times over.
                name: plan.target ? planName(plan.target, constellation) : plan.name,
              })
            }
            max={MAX_COPIES - 1}
            valueText={(v) => `C${v}`}
          />

          <StepperRow
            label={dateLabel ? `Income by ${dateLabel}` : 'Income'}
            note={
              result.incomeIsOverridden
                ? 'Your figure. Open the sheet to go back to the projection.'
                : `Projected over ${result.income.days} ${result.income.days === 1 ? 'day' : 'days'}`
            }
            value={Math.round(result.projectedPrimogems)}
            onChange={(incomeOverride) => update({ incomeOverride })}
            step={100}
            max={999_999}
          />
        </div>

        {/*
          The balance is carried forward, not retyped, so the screen has to
          show its working: where it started, what it added, what it took off.
          An unexplained number the player did not enter is worse than no
          number at all.
        */}
        {balance.overdrawn ? (
          <p className={screen.caption} role="alert">
            Those {formatNumber(balance.pullsSince)} pulls cost more than you had on{' '}
            {confirmedLabel}. Enter your primogems to put it right.
          </p>
        ) : ledgerMoved ? (
          <p className={screen.caption}>
            Carried forward from {confirmedLabel}
            {balance.earnedPrimogems > 0
              ? `, +${formatNumber(balance.earnedPrimogems)} earned`
              : ''}
            {balance.pullsSince > 0
              ? `, ${formatNumber(balance.pullsSince)} ${balance.pullsSince === 1 ? 'pull' : 'pulls'} spent`
              : ''}
            . Edit it if it&rsquo;s drifted.
          </p>
        ) : null}

        <div className={screen.actions}>
          <button type="button" className={screen.sheetButton} onClick={() => setSheetOpen(true)}>
            Income assumptions
          </button>
          <button type="button" className={screen.sheetButton} onClick={addPlan}>
            Save another plan
          </button>
          {plans.length > 1 ? (
            <button type="button" className={screen.sheetButton} onClick={removePlan}>
              Delete this plan
            </button>
          ) : null}
        </div>

        <IncomeSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          plan={plan}
          onChange={update}
          projected={result.income.primogems}
          overridden={result.incomeIsOverridden}
        />
      </div>
    </section>
  );
}
