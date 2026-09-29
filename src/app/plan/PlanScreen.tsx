'use client';

import { useMemo, useRef, useState } from 'react';

import { FateDial } from '@/components/FateDial';
import screen from '@/components/screen.module.css';
import { AnswerBlock, SegmentedControl, StepperRow } from '@/components/ui';
import { MAX_COPIES } from '@/engine/wish/featured';
import { formatNumber, formatPercent } from '@/lib/format';

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

export function PlanScreen() {
  // One clock reading per mount, so the projection does not shift under the
  // animation while the player is reading it.
  const now = useMemo(() => new Date(), []);
  const { plan, ready, result, update } = usePlan(now);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The chart drives the numeral, so the redraw and the count are one moment.
  const numeralRef = useRef<HTMLSpanElement>(null);

  if (!ready || !plan || !result) {
    // Holds the layout still rather than flashing a zero answer that then
    // jumps to the stored one.
    return <section className={screen.panel} aria-busy="true" />;
  }

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
  const datePassed = targetDate !== null && targetDate.getTime() <= now.getTime();

  return (
    <section className={screen.panel} aria-labelledby="plan-title">
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
        <h2 className={screen.sec}>Your stash</h2>
        <div className={screen.ledger}>
          <StepperRow
            label="Primogems"
            value={plan.primogems}
            onChange={(primogems) => update({ primogems })}
            step={160}
          />
          <StepperRow
            label="Intertwined Fates"
            value={plan.fates}
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
            onChange={(constellation) => update({ constellation })}
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

        <div className={screen.actions}>
          <button type="button" className={screen.sheetButton} onClick={() => setSheetOpen(true)}>
            Income assumptions
          </button>
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
