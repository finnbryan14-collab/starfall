import { memo } from 'react';

import styles from './AnswerBlock.module.css';

/**
 * The one big answer per screen: title in Bodoni italic, the numeral in Bodoni
 * hero, then a plain sentence saying what it means (DESIGN.md).
 *
 * The unit sits in its own element rather than inside the numeral — partly for
 * type reasons, and partly because anime.js's scrambleText treats a trailing %
 * as a unit and doubles it (see src/motion/index.ts).
 */

/**
 * The numeral, frozen after its first paint.
 *
 * When a caller passes `valueRef`, something else — the Fate Dial's timeline —
 * owns this text. React must then stop writing it: otherwise a changed input
 * re-renders the final value into the DOM before the tween starts, the tween
 * reads its own target as the starting point, and the count never happens. The
 * number simply snaps.
 *
 * Server-rendered content is still correct, because the first paint carries the
 * real value; only later updates are left to the animation.
 */
const FrozenNumeral = memo(
  function FrozenNumeral({
    value,
    numeralRef,
  }: {
    value: string;
    numeralRef?: React.Ref<HTMLSpanElement>;
  }) {
    return <span ref={numeralRef}>{value}</span>;
  },
  // Never re-render: the animation is the only writer from here on.
  () => true,
);

export type AnswerBlockProps = {
  title: string;
  titleId?: string;
  value: string;
  unit?: string;
  /** Spoken form of the numeral, which is aria-hidden as pure display. */
  valueLabel?: string;
  children: React.ReactNode;
  /**
   * Hands ownership of the numeral's text to the caller's animation. Without
   * it the numeral is plain React state and updates normally.
   */
  valueRef?: React.Ref<HTMLSpanElement>;
};

export function AnswerBlock({
  title,
  titleId,
  value,
  unit,
  valueLabel,
  children,
  valueRef,
}: AnswerBlockProps) {
  return (
    <>
      <h1 className={styles.title} id={titleId}>
        {title}
      </h1>
      <p className={styles.answer} aria-hidden="true">
        {valueRef ? <FrozenNumeral value={value} numeralRef={valueRef} /> : <span>{value}</span>}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </p>
      {/*
        The sentence is the accessible answer and always reflects the current
        value, even while the numeral above is mid-count.
      */}
      <p className={styles.lede} aria-live="polite">
        {valueLabel ? <span className="sr-only">{valueLabel} </span> : null}
        {children}
      </p>
    </>
  );
}
