'use client';

import { animate, stagger } from 'animejs';
import { useRef } from 'react';

import type { Histogram } from '@/engine/artifacts/score';
import { formatNumber } from '@/lib/format';
import { duration, useAnimeScope, useReducedMotion } from '@/motion';

import styles from './ScoreHistogram.module.css';

/**
 * Where a piece lands at +20, across the simulated upgrade paths.
 *
 * Bars past the goal are gold — the thing you want — and the goal itself is a
 * dashed line rather than a second axis, so the chart carries one idea.
 */

const W = 358;
const H = 150;
const PAD = { left: 4, right: 4, top: 22, bottom: 24 };
const GAP = 5;

export type ScoreHistogramProps = {
  histogram: Histogram;
  goalThreshold: number;
  /** Share of outcomes that meet the goal, for the accessible description. */
  probability: number;
  /** How many upgrade paths were simulated, for the caption. */
  trials: number;
  unit?: string;
};

export function ScoreHistogram({
  histogram,
  goalThreshold,
  probability,
  trials,
  unit = 'crit value',
}: ScoreHistogramProps) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { bins, max } = histogram;
  const binWidth = (W - PAD.left - PAD.right) / bins.length;
  const plotHeight = H - PAD.top - PAD.bottom;
  const baseline = H - PAD.bottom;

  const from = bins[0]?.from ?? 0;
  const width = (bins[0]?.to ?? 5) - from;
  const goalX = PAD.left + ((goalThreshold - from) / width) * binWidth;

  useAnimeScope(
    root,
    (scope) => {
      scope.add(() => {
        const move = duration('move');
        if (reduced || move <= 0) return;
        animate('[data-bar]', {
          scaleY: [0, 1],
          duration: move,
          delay: stagger(24, { from: 'first' }),
          ease: 'out(3)',
        });
      });
    },
    [histogram, reduced],
  );

  const description = `Distribution of ${unit} at +20. ${(probability * 100).toFixed(1)} percent of outcomes reach ${goalThreshold} or more.`;

  return (
    <figure className={styles.figure} ref={root}>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={description}>
        {bins.map((bin, i) => {
          const height = Math.max(1.5, (bin.count / Math.max(1, max)) * plotHeight);
          return (
            <rect
              key={bin.from}
              data-bar
              className={bin.meetsGoal ? styles.barHit : styles.bar}
              x={PAD.left + i * binWidth + GAP / 2}
              y={baseline - height}
              width={binWidth - GAP}
              height={height}
              rx={2}
              style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
            />
          );
        })}

        <line
          className={styles.base}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={baseline}
          y2={baseline}
        />

        {bins
          .filter((_, i) => i % 2 === 0)
          .map((bin, i) => (
            <text
              key={bin.from}
              className={styles.axis}
              x={PAD.left + i * 2 * binWidth}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : 'middle'}
            >
              {bin.from}
            </text>
          ))}

        <line className={styles.goalLine} x1={goalX} x2={goalX} y1={10} y2={baseline} />
        <text className={styles.goalText} x={goalX + 5} y={12}>
          goal {goalThreshold}
        </text>
      </svg>

      <figcaption className={styles.caption}>
        Where it lands at +20, across {formatNumber(trials)} simulated upgrade paths.
      </figcaption>

      {/*
        Wrapped rather than marked `sr-only` directly: a table ignores a width
        below its own min-content width, so an sr-only table is still laid out
        at full size and pushes the page sideways — 531px of scroll width at a
        390px viewport. A block wrapper honours the 1px box and clips it.
      */}
      <div className="sr-only">
        <table>
          <caption>{description}</caption>
          <thead>
            <tr>
              <th scope="col">Score</th>
              <th scope="col">Outcomes</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr key={bin.from}>
                <th scope="row">
                  {bin.from} to {bin.to}
                </th>
                <td>{bin.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
