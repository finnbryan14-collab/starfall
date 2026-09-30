import styles from './FieldRow.module.css';

/**
 * A labelled row in a ledger, for controls that are not steppers.
 *
 * Same shape as StepperRow — label left, control right, optional note under
 * the label — so a plan's text and date inputs sit in the same rhythm as its
 * numbers instead of looking like a different form.
 */

export type FieldRowProps = {
  label: string;
  /** Ties the label to the control, which must carry this id. */
  htmlFor: string;
  note?: string;
  children: React.ReactNode;
};

export function FieldRow({ label, htmlFor, note, children }: FieldRowProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {note ? <span className={styles.note}>{note}</span> : null}
      </label>
      {children}
    </div>
  );
}
