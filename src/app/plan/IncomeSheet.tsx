'use client';

import { BottomSheet, StepperRow } from '@/components/ui';
import type { Plan } from '@/db/schema';
import { ASSUMPTIONS_VERIFIED_AT, ALL_SOURCED_VALUES } from '@/engine/income';
import type { IncomeToggles } from '@/engine/income';
import { formatNumber } from '@/lib/format';

import styles from './IncomeSheet.module.css';

/**
 * Editing the income assumptions (SPEC.md, DESIGN.md).
 *
 * Each row says where its number came from and how confident it is, because
 * some are published by HoYoverse and others are the midpoint of a wide
 * community range. A player deciding whether to trust the projection needs to
 * see which is which.
 */

type ToggleRow = {
  key: keyof IncomeToggles;
  label: string;
  note: string;
  amount: (plan: Plan) => string;
  confidence: 'official' | 'community';
};

const ROWS: ToggleRow[] = [
  {
    key: 'dailyCommissions',
    label: 'Daily commissions',
    note: 'Four commissions plus the completion bonus',
    amount: (plan) => `${plan.assumptions.dailyCommissions} a day`,
    confidence: ALL_SOURCED_VALUES.DAILY_COMMISSIONS.confidence,
  },
  {
    key: 'welkin',
    label: 'Welkin Moon',
    note: 'While it lasts, claimed on login',
    amount: (plan) => `${plan.assumptions.welkinPerDay} a day`,
    confidence: ALL_SOURCED_VALUES.WELKIN_PER_DAY.confidence,
  },
  {
    key: 'spiralAbyss',
    label: 'Spiral Abyss',
    note: 'Resets on the 16th of each month',
    amount: (plan) => `${formatNumber(plan.assumptions.spiralAbyssPerReset)} a reset`,
    confidence: ALL_SOURCED_VALUES.SPIRAL_ABYSS_PER_RESET.confidence,
  },
  {
    key: 'imaginariumTheater',
    label: 'Imaginarium Theater',
    note: 'Resets on the 1st of each month',
    amount: (plan) => `${formatNumber(plan.assumptions.imaginariumTheaterPerReset)} a reset`,
    confidence: ALL_SOURCED_VALUES.IMAGINARIUM_THEATER_PER_RESET.confidence,
  },
  {
    key: 'events',
    label: 'Events',
    note: 'Swings the most between patches. Worth your own estimate.',
    amount: (plan) => `${formatNumber(plan.assumptions.eventsPerPatch)} a patch`,
    confidence: ALL_SOURCED_VALUES.EVENTS_PER_PATCH.confidence,
  },
  {
    key: 'compensation',
    label: 'Codes and compensation',
    note: 'Livestream codes, maintenance',
    amount: (plan) => `${formatNumber(plan.assumptions.compensationPerPatch)} a patch`,
    confidence: ALL_SOURCED_VALUES.COMPENSATION_PER_PATCH.confidence,
  },
  {
    key: 'exploration',
    label: 'Exploration and quests',
    note: 'Near zero if you have already explored the new map',
    amount: (plan) => `${formatNumber(plan.assumptions.explorationPerPatch)} a patch`,
    confidence: ALL_SOURCED_VALUES.EXPLORATION_PER_PATCH.confidence,
  },
  {
    key: 'battlePass',
    label: 'Battle Pass',
    note: 'Paid track, plus about 4 fates',
    amount: (plan) => `${formatNumber(plan.assumptions.battlePassPerPatch)} a patch`,
    confidence: ALL_SOURCED_VALUES.BATTLE_PASS_PER_PATCH.confidence,
  },
  {
    key: 'stardustFates',
    label: 'Stardust shop fates',
    note: 'Five a month, resetting on the 1st',
    amount: (plan) => `${plan.assumptions.stardustFatesPerMonth} fates a month`,
    confidence: ALL_SOURCED_VALUES.STARDUST_FATES_PER_MONTH.confidence,
  },
];

export type IncomeSheetProps = {
  open: boolean;
  onClose: () => void;
  plan: Plan;
  onChange: (patch: Partial<Plan>) => void;
  /** What the projection currently comes to, for the footer. */
  projected: number;
  overridden: boolean;
};

export function IncomeSheet({
  open,
  onClose,
  plan,
  onChange,
  projected,
  overridden,
}: IncomeSheetProps) {
  const toggle = (key: keyof IncomeToggles) =>
    onChange({ enabled: { ...plan.enabled, [key]: !plan.enabled[key] } });

  return (
    <BottomSheet open={open} onClose={onClose} title="Income">
      <div className={styles.rows}>
        {ROWS.map((row) => (
          <label key={row.key} className={styles.row}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={Boolean(plan.enabled[row.key])}
              onChange={() => toggle(row.key)}
            />
            <span className={styles.text}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.note}>{row.note}</span>
            </span>
            <span className={styles.amount}>
              {row.amount(plan)}
              {row.confidence === 'community' ? (
                <span
                  className={styles.estimate}
                  title="Community estimate, not an official figure"
                >
                  estimate
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      {plan.enabled.welkin ? (
        <div className={styles.stepper}>
          <StepperRow
            label="Welkin days left"
            value={plan.welkinDaysRemaining}
            onChange={(welkinDaysRemaining) => onChange({ welkinDaysRemaining })}
            max={180}
            valueText={(v) => `${v} days of Welkin remaining`}
          />
        </div>
      ) : null}

      <p className={styles.footer}>
        {overridden ? (
          <>
            You typed over the projection. It would otherwise come to{' '}
            <strong>{formatNumber(projected)}</strong>.{' '}
            <button
              type="button"
              className={styles.link}
              onClick={() => onChange({ incomeOverride: null })}
            >
              Use the projection
            </button>
          </>
        ) : (
          <>
            Projected: <strong>{formatNumber(projected)}</strong> primogems.
          </>
        )}
      </p>
      <p className={styles.verified}>Assumptions checked {ASSUMPTIONS_VERIFIED_AT}.</p>
    </BottomSheet>
  );
}
