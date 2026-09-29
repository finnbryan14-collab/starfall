'use client';

import { useState } from 'react';

import { AnswerBlock, SegmentedControl, StepperRow } from '@/components/ui';
import screen from '@/components/screen.module.css';

/**
 * Phase 0: the shell and the real controls, with static results.
 *
 * Every figure below is verified output of the model in docs/MATH.md §1 at the
 * preview's sample inputs (11,200 primogems, 14 fates, pity 22, 50/50, 3,850
 * income -> 108 pulls): 72.88 / 15.65 / 1.53 percent, and 134 pulls for 90%
 * odds. The inputs move, but nothing recomputes yet — the engine, the Fate Dial
 * and the income sheet are Phase 1.
 */

const CONSTELLATIONS = [
  { label: 'C0', chance: '73%', starOpacity: 0.8 },
  { label: 'C1', chance: '16%', starOpacity: 0.37 },
  { label: 'C2', chance: '2%', starOpacity: 0.26 },
];

export function PlanScreen() {
  const [primos, setPrimos] = useState(11_200);
  const [fates, setFates] = useState(14);
  const [pity, setPity] = useState(22);
  const [income, setIncome] = useState(3_850);
  const [guarantee, setGuarantee] = useState<'fifty' | 'guaranteed'>('fifty');

  return (
    <section className={screen.panel} aria-labelledby="plan-title">
      <div>
        <AnswerBlock
          title="Skirk returns Oct 13"
          titleId="plan-title"
          value="72.9"
          unit="%"
          valueLabel="72.9 percent"
        >
          chance you get her by then, with the <strong>108</strong> pulls you&rsquo;ll have.
        </AnswerBlock>

        <figure style={{ margin: 0 }}>
          <div className={screen.pending} style={{ aspectRatio: '358 / 214' }}>
            Fate Dial — Phase 1
          </div>
          <figcaption className={screen.caption}>
            Chance of getting her by each pull. Gold is what your stash covers.
          </figcaption>
        </figure>

        <ul className={screen.cons} aria-label="Chance by constellation">
          {CONSTELLATIONS.map((c) => (
            <li key={c.label}>
              {/* The preview fades each star in proportion to its chance. */}
              <span className={screen.star} aria-hidden="true" style={{ opacity: c.starOpacity }}>
                ★
              </span>
              {c.label} <b>{c.chance}</b>
            </li>
          ))}
        </ul>

        <p className={screen.hint}>26 more pulls (4,160 primogems) gets you to 90% odds.</p>
      </div>

      <div className={screen.colSide}>
        <h2 className={screen.sec}>Your stash</h2>
        <div className={screen.ledger}>
          <StepperRow label="Primogems" value={primos} onChange={setPrimos} step={160} />
          <StepperRow label="Intertwined Fates" value={fates} onChange={setFates} max={9_999} />
          <StepperRow
            label="Pity"
            note="Pulls since your last 5★"
            value={pity}
            onChange={setPity}
            max={89}
            valueText={(v) => `${v} pulls since your last 5-star`}
          />
          <div className={screen.row}>
            <span className={screen.rowLabel}>Next 5★</span>
            <SegmentedControl
              label="Next 5★"
              value={guarantee}
              onChange={setGuarantee}
              options={[
                { value: 'fifty', label: '50/50' },
                { value: 'guaranteed', label: 'Guaranteed' },
              ]}
            />
          </div>
          <StepperRow
            label="Income by Oct 13"
            note="2,250 from dailies and Welkin, plus your estimate for events"
            value={income}
            onChange={setIncome}
            step={100}
            max={99_999}
          />
        </div>
      </div>
    </section>
  );
}
