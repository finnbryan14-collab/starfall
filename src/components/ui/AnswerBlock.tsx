import styles from './AnswerBlock.module.css';

/**
 * The one big answer per screen: title in Bodoni italic, the numeral in Bodoni
 * hero, then a plain sentence saying what it means (DESIGN.md).
 *
 * The unit sits in its own element rather than inside the numeral — partly for
 * type reasons, and partly because anime.js's scrambleText treats a trailing %
 * as a unit and doubles it (see src/motion/index.ts).
 */
export type AnswerBlockProps = {
  title: string;
  titleId?: string;
  value: string;
  unit?: string;
  /** Spoken form of the numeral, which is aria-hidden as pure display. */
  valueLabel?: string;
  children: React.ReactNode;
  valueRef?: React.Ref<HTMLParagraphElement>;
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
        <span ref={valueRef}>{value}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </p>
      <p className={styles.lede} aria-live="polite">
        {valueLabel ? <span className="sr-only">{valueLabel} </span> : null}
        {children}
      </p>
    </>
  );
}
