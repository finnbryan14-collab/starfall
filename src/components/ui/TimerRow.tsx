import styles from './TimerRow.module.css';

/**
 * Name, state, and a thin progress line in --rule filled with --starlight —
 * gold only when ready (DESIGN.md). Gold means "the thing you want", so it
 * appears the moment the timer is worth acting on and not before.
 *
 * `fraction` is null for timers with no meaningful progress bar, such as a
 * fixed daily reset.
 */
export type TimerRowProps = {
  name: string;
  state: string;
  fraction?: number | null;
  ready?: boolean;
};

export function TimerRow({ name, state, fraction = null, ready }: TimerRowProps) {
  return (
    <div className={styles.timer}>
      <div className={styles.top}>
        <span>{name}</span>
        <span className={styles.state} data-ready={ready || undefined}>
          {state}
        </span>
      </div>
      {fraction !== null ? (
        <div className={styles.track}>
          <i
            data-ready={ready || undefined}
            style={{ width: `${(Math.max(0, Math.min(1, fraction)) * 100).toFixed(1)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
