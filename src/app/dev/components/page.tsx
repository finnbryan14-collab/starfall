'use client';

import { useState } from 'react';

import {
  AnswerBlock,
  BottomSheet,
  SegmentedControl,
  StepperRow,
  SubstatLine,
  TimerRow,
} from '@/components/ui';

/**
 * Workbench for the core components. Every one is interactive, so keyboard
 * focus and reduced motion can be checked by tabbing through and toggling the
 * OS setting.
 */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 'var(--s-7)' }}>
      <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, margin: '0 0 var(--s-1)' }}>
        {title}
      </h2>
      <p
        style={{
          color: 'var(--dim)',
          fontSize: 'var(--t-sm)',
          margin: '0 0 var(--s-3)',
          maxWidth: '58ch',
        }}
      >
        {note}
      </p>
      {children}
    </section>
  );
}

export default function ComponentsPage() {
  const [primos, setPrimos] = useState(11_200);
  const [pity, setPity] = useState(22);
  const [guaranteed, setGuaranteed] = useState<'fifty' | 'guaranteed'>('fifty');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [welkin, setWelkin] = useState(23);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', paddingBottom: 'var(--s-8)' }}>
      <Section
        title="AnswerBlock"
        note="The one big answer per screen. The numeral is aria-hidden display; the sentence below it carries the meaning for screen readers."
      >
        <AnswerBlock title="Skirk returns Oct 13" value="72.9" unit="%">
          chance you get her by then, with the <strong>108</strong> pulls you&rsquo;ll have.
        </AnswerBlock>
      </Section>

      <Section
        title="StepperRow"
        note="44px targets, tabular figures, thousands separators. Arrow keys step, Home and End jump to the bounds, long-press repeats. Spinbutton ARIA is supplied by hand because the text input gives none for free."
      >
        <div style={{ borderTop: '1px solid var(--rule)' }}>
          <StepperRow label="Primogems" value={primos} onChange={setPrimos} step={160} />
          <StepperRow
            label="Pity"
            note="Pulls since your last 5★"
            value={pity}
            onChange={setPity}
            max={89}
            valueText={(v) => `${v} pulls since your last 5-star`}
          />
        </div>
      </Section>

      <Section
        title="SegmentedControl"
        note="Radio semantics, so exactly one is chosen and arrow keys move between options. The selected option fills and takes a gold underline."
      >
        <SegmentedControl
          label="Next 5★"
          value={guaranteed}
          onChange={setGuaranteed}
          options={[
            { value: 'fifty', label: '50/50' },
            { value: 'guaranteed', label: 'Guaranteed' },
          ]}
        />
      </Section>

      <Section
        title="SubstatLine"
        note="The bar behind the value shows roll value: this line's share of the maximum it could have reached. Gold marks a stat that counts toward the goal — always alongside the number, never instead of it."
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <SubstatLine name="CRIT Rate" value="3.1%" rollValue={3.11 / (3.89 * 6)} goal />
          <SubstatLine name="CRIT DMG" value="7.0%" rollValue={6.99 / (7.77 * 6)} goal />
          <SubstatLine name="Energy Recharge" value="5.2%" rollValue={5.18 / (6.48 * 6)} />
          <SubstatLine name="DEF" value="19" rollValue={18.52 / (23.15 * 6)} />
        </ul>
      </Section>

      <Section
        title="TimerRow"
        note="Gold appears only when the timer is worth acting on. Timers with no meaningful progress, like a fixed daily reset, omit the bar."
      >
        <div style={{ borderTop: '1px solid var(--rule)' }}>
          <TimerRow name="Original Resin" state="Full in 7 h 36 min" fraction={143 / 200} />
          <TimerRow name="Parametric Transformer" state="Ready" fraction={1} ready />
          <TimerRow name="Daily reset" state="04:00 server time" />
        </div>
      </Section>

      <Section
        title="BottomSheet"
        note="Built on <dialog>, so the top layer, backdrop, Escape-to-close and focus containment come from the platform. Tab inside it and focus stays put."
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          style={{
            minHeight: 48,
            padding: '0 18px',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--rule)',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Edit income assumptions
        </button>

        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Income">
          <div style={{ borderTop: '1px solid var(--rule)', marginTop: 'var(--s-3)' }}>
            <StepperRow
              label="Welkin days left"
              value={welkin}
              onChange={setWelkin}
              max={180}
              valueText={(v) => `${v} days of Welkin remaining`}
            />
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 'var(--t-xs)', marginTop: 'var(--s-3)' }}>
            Assumptions checked Sep 2026.
          </p>
        </BottomSheet>
      </Section>
    </div>
  );
}
