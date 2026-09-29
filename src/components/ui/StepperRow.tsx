'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { formatNumber, parseNumber } from '@/lib/format';

import styles from './StepperRow.module.css';

/**
 * Label left, value right in tabular figures, 44px minus and plus buttons.
 * Long-press repeats (DESIGN.md).
 *
 * The input is `type="text" inputmode="numeric"` rather than a native number
 * input, because a number input cannot display thousands separators and
 * "11,200" is much easier to read on a phone than "11200". That costs the free
 * spinbutton semantics, so they are supplied explicitly: role, the three value
 * attributes, and ArrowUp/ArrowDown handling. See docs/DECISIONS.md.
 */

const REPEAT_DELAY_MS = 500;
const REPEAT_INTERVAL_MS = 80;

export type StepperRowProps = {
  label: string;
  note?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Spoken form, when the bare number would be ambiguous. */
  valueText?: (value: number) => string;
};

export function StepperRow({
  label,
  note,
  value,
  onChange,
  min = 0,
  max = 999_999,
  step = 1,
  valueText,
}: StepperRowProps) {
  const inputId = useId();
  const noteId = useId();

  // Free text while focused, so a half-typed number is not reformatted under
  // the cursor. Reformatted on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const repeatTimers = useRef<{
    delay?: ReturnType<typeof setTimeout>;
    interval?: ReturnType<typeof setInterval>;
  }>({});

  const clamp = useCallback((next: number) => Math.min(max, Math.max(min, next)), [min, max]);

  const nudge = useCallback(
    (delta: number) => {
      onChange(clamp(value + delta));
    },
    [clamp, onChange, value],
  );

  const stopRepeat = useCallback(() => {
    clearTimeout(repeatTimers.current.delay);
    clearInterval(repeatTimers.current.interval);
    repeatTimers.current = {};
  }, []);

  // A pointer released outside the button still has to stop the repeat.
  useEffect(() => stopRepeat, [stopRepeat]);

  const startRepeat = useCallback(
    (delta: number) => {
      nudge(delta);
      repeatTimers.current.delay = setTimeout(() => {
        repeatTimers.current.interval = setInterval(() => nudge(delta), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    },
    [nudge],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudge(step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudge(-step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(min);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(max);
    }
  };

  const commit = () => {
    if (draft !== null) onChange(clamp(parseNumber(draft)));
    setDraft(null);
  };

  return (
    <div className={styles.row}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {note ? (
          <span className={styles.note} id={noteId}>
            {note}
          </span>
        ) : null}
      </label>

      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.button}
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onPointerDown={() => startRepeat(-step)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          −
        </button>

        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={valueText ? valueText(value) : undefined}
          aria-describedby={note ? noteId : undefined}
          value={draft ?? formatNumber(value)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />

        <button
          type="button"
          className={styles.button}
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onPointerDown={() => startRepeat(step)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          +
        </button>
      </div>
    </div>
  );
}
