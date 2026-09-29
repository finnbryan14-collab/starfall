import styles from './SubstatLine.module.css';

/**
 * Stat name left, value right, with a thin bar behind the value showing roll
 * value — this line's share of the maximum it could have reached (DESIGN.md).
 *
 * `goal` marks a stat that counts toward the current goal, which tints the bar
 * gold. Rarity and importance are never colour alone, so the bar is a
 * supplement to the number, not a replacement for it.
 */
export type SubstatLineProps = {
  name: string;
  value: string;
  /** 0 to 1: the share of the maximum possible roll value on this line. */
  rollValue: number;
  goal?: boolean;
};

export function SubstatLine({ name, value, rollValue, goal }: SubstatLineProps) {
  const percent = Math.max(0, Math.min(1, rollValue)) * 100;

  return (
    <li className={styles.sub} data-goal={goal || undefined}>
      <span className={styles.name}>{name}</span>
      <span className={styles.value}>{value}</span>
      <span className={styles.bar} aria-hidden="true">
        <i style={{ width: `${percent.toFixed(1)}%` }} />
      </span>
    </li>
  );
}
