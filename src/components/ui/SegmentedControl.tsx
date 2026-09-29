'use client';

import { useId } from 'react';

import styles from './SegmentedControl.module.css';

/**
 * Two or three options in a pill. The selected option fills with --well-2 and
 * carries a gold underline (DESIGN.md).
 *
 * Radio semantics rather than a row of toggle buttons: exactly one is chosen,
 * and arrow keys move between them for free.
 */
export type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const name = useId();

  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label key={option.value} className={styles.option} data-selected={selected || undefined}>
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.text}>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
