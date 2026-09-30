'use client';

import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';

import type { BalancePoint } from '@/engine/income';
import { formatNumber } from '@/lib/format';

import styles from './BalanceLine.module.css';

/**
 * The primogem balance from now to the target date (SPEC.md section 1).
 *
 * Deliberately small and quiet. The dial above it already carries the answer;
 * this only says whether the money arrives steadily or in lumps, which is what
 * decides whether waiting another week is worth anything.
 *
 * Hand-drawn SVG from d3 scales, like the Fate Dial — d3 for the geometry,
 * ours for the marks (CLAUDE.md).
 */

export type BalanceLineProps = {
  curve: readonly BalancePoint[];
  /** Labelled on the right-hand end, so the number has a date attached. */
  targetLabel: string | null;
};

const WIDTH = 320;
const HEIGHT = 44;
const PAD = 2;

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function BalanceLine({ curve, targetLabel }: BalanceLineProps) {
  // Nothing to draw if the plan has no span, or the balance never moves.
  if (curve.length < 2) return null;

  const first = curve[0];
  const last = curve[curve.length - 1];
  if (last.primogems === first.primogems) return null;

  const x = scaleLinear()
    .domain([first.at, last.at])
    .range([PAD, WIDTH - PAD]);
  const y = scaleLinear()
    .domain([first.primogems, last.primogems])
    .range([HEIGHT - PAD, PAD]);

  const path =
    line<BalancePoint>()
      .x((point) => x(point.at))
      .y((point) => y(point.primogems))(curve as BalancePoint[]) ?? '';

  const gained = last.primogems - first.primogems;
  const summary =
    `Primogems from ${formatNumber(first.primogems)} today to ` +
    `${formatNumber(last.primogems)} by ${DATE.format(last.at)}, ` +
    `a gain of ${formatNumber(gained)}.`;

  // A handful of dated rows rather than every sample: enough to read the shape,
  // short enough to listen to.
  const rows = [0, Math.floor(curve.length / 2), curve.length - 1].map((index) => curve[index]);

  return (
    <figure className={styles.figure}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
      >
        <path className={styles.line} d={path} />
      </svg>

      <figcaption className={styles.caption}>
        <span>{formatNumber(first.primogems)} now</span>
        <span className={styles.end}>
          {formatNumber(last.primogems)}
          {targetLabel ? ` by ${targetLabel}` : ''}
        </span>
      </figcaption>

      {/* The chart's data, for anyone not reading the picture (DESIGN.md). */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Primogems</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((point) => (
              <tr key={point.at}>
                <td>{DATE.format(point.at)}</td>
                <td>{formatNumber(point.primogems)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
