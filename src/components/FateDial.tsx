'use client';

import { createTimeline, stagger, svg } from 'animejs';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';
import { useMemo, useRef, type RefObject } from 'react';

import { duration, tweenNumber, useAnimeScope, useReducedMotion } from '@/motion';
import { formatNumber, formatPercent } from '@/lib/format';

import styles from './FateDial.module.css';

/**
 * The wish planner's chart, and the app's one orchestrated moment (DESIGN.md).
 *
 * X is pulls, Y is the chance you have the target by that pull. The full curve
 * is drawn faint — what is possible. The part your stash covers is gold with a
 * wash beneath it — what is yours. A meteor sits where the two meet.
 *
 * On load and on every input change the gold segment redraws from zero, the
 * meteor rides along it, and the big numeral counts to the new value. It never
 * loops.
 */

const W = 358;
const H = 214;
const PAD = { left: 6, right: 14, top: 16, bottom: 30 };
const TICK_STEP = 45;

export type FateDialProps = {
  /** CDF indexed by pulls. */
  curve: Float64Array;
  /** Pulls the player will have. */
  pulls: number;
  /** Chance at `pulls` — what the numeral counts to. */
  chance: number;
  /** The numeral to count, so the chart and the answer share one timeline. */
  numeralRef?: RefObject<HTMLElement | null>;
  /** Named in the accessible description, e.g. "Skirk". */
  target?: string;
};

export function FateDial({ curve, pulls, chance, numeralRef, target }: FateDialProps) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const geometry = useMemo(() => {
    // Keep the axis a round multiple of the tick step, and always show a little
    // past where the player stands so the meteor is never on the edge.
    const xMax = Math.max(180, Math.ceil((pulls + 12) / TICK_STEP) * TICK_STEP);
    const lastIndex = curve.length - 1;

    const x = scaleLinear()
      .domain([0, xMax])
      .range([PAD.left, W - PAD.right]);
    const y = scaleLinear()
      .domain([0, 1])
      .range([H - PAD.bottom, PAD.top]);

    const valueAt = (t: number) => curve[Math.min(t, lastIndex)];
    const points = (from: number, to: number) =>
      Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

    const toLine = line<number>()
      .x((t) => x(t))
      .y((t) => y(valueAt(t)));
    const toArea = area<number>()
      .x((t) => x(t))
      .y0(y(0))
      .y1((t) => y(valueAt(t)));

    const mineTo = Math.min(pulls, xMax);
    const all = toLine(points(0, xMax)) ?? '';
    // A zero-length path still needs two points, or createDrawable has no
    // geometry to measure and the meteor has nowhere to ride.
    const mine =
      mineTo > 0 ? (toLine(points(0, mineTo)) ?? '') : `M${x(0)},${y(0)}L${x(0) + 0.01},${y(0)}`;
    const wash = mineTo > 0 ? (toArea(points(0, mineTo)) ?? '') : '';

    const ticks: number[] = [];
    for (let t = 0; t <= xMax; t += TICK_STEP) ticks.push(t);

    return {
      xMax,
      all,
      mine,
      wash,
      ticks,
      x,
      y,
      markerX: x(mineTo),
      markerY: y(valueAt(mineTo)),
      baseline: y(0),
      half: y(0.5),
      // Label flips side near the right edge so it never runs off the chart.
      labelRight: x(mineTo) > W * 0.62,
    };
  }, [curve, pulls]);

  // The signature moment. Re-runs whenever the geometry or the answer changes,
  // which is exactly "on load and on input change" from DESIGN.md.
  useAnimeScope(
    root,
    (scope) => {
      scope.add(() => {
        const element = root.current;
        if (!element) return;

        const goldPath = element.querySelector<SVGPathElement>('[data-mine]');
        const meteor = element.querySelector<SVGGElement>('[data-meteor]');
        const late = element.querySelectorAll<SVGElement>('[data-late]');
        const signature = duration('signature');

        if (!goldPath || !meteor) return;

        const landMeteor = () => {
          meteor.style.transform = `translate(${geometry.markerX}px, ${geometry.markerY}px)`;
        };

        if (reduced || signature <= 0) {
          goldPath.style.strokeDasharray = '';
          landMeteor();
          late.forEach((el) => (el.style.opacity = '1'));
          if (numeralRef?.current) numeralRef.current.textContent = formatPercent(chance);
          return;
        }

        // Anything that arrives later starts hidden. Timeline children do not
        // apply their `from` values until they start, so without this they
        // flash in at full opacity first (see src/motion/index.ts).
        late.forEach((el) => (el.style.opacity = '0'));

        // createDrawable and createMotionPath are built fresh on every run,
        // because the dash length and the path geometry both belong to the
        // current `d` (see src/motion/index.ts).
        createTimeline({ defaults: { ease: 'inOut(2)' } })
          .add(svg.createDrawable(goldPath), { draw: ['0 0', '0 1'], duration: signature }, 0)
          .add(meteor, { ...svg.createMotionPath(goldPath), duration: signature }, 0)
          .add(
            late,
            {
              opacity: [0, 1],
              translateY: [4, 0],
              duration: 360,
              delay: stagger(60),
              ease: 'out(3)',
            },
            // After the meteor lands, not alongside it.
            signature * 0.73,
          );

        if (numeralRef?.current) {
          const from = Number(numeralRef.current.textContent) || 0;
          tweenNumber(numeralRef.current, from, chance * 100, (v) => v.toFixed(1));
        }
      });
    },
    [geometry, chance, reduced],
  );

  const percent = formatPercent(chance);
  const description = `Chance of getting ${target ?? 'the target'} by pull count. With ${formatNumber(
    pulls,
  )} pulls the chance is ${percent} percent.`;

  return (
    <figure className={styles.figure} ref={root}>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={description}>
        <defs>
          <linearGradient id="fate-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--gold)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--gold)" stopOpacity="0.02" />
          </linearGradient>
          <radialGradient id="fate-glow">
            <stop offset="0" stopColor="var(--gold)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* One hairline at 50% and a baseline. No other gridlines (DESIGN.md). */}
        <line
          className={styles.base}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={geometry.baseline}
          y2={geometry.baseline}
        />
        <line
          className={styles.hair}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={geometry.half}
          y2={geometry.half}
        />
        <text className={styles.axis} x={W - PAD.right} y={geometry.half - 5} textAnchor="end">
          50%
        </text>

        {geometry.ticks.map((t) => (
          <text
            key={t}
            className={styles.axis}
            x={geometry.x(t)}
            y={H - 8}
            textAnchor={t === 0 ? 'start' : t === geometry.xMax ? 'end' : 'middle'}
          >
            {t === geometry.xMax ? `${t} pulls` : t}
          </text>
        ))}

        <path className={styles.wash} data-late d={geometry.wash} fill="url(#fate-wash)" />
        <path className={styles.all} d={geometry.all} />

        <line
          className={styles.youLine}
          data-late
          x1={geometry.markerX}
          x2={geometry.markerX}
          y1={geometry.markerY + 6}
          y2={geometry.baseline}
        />
        <path className={styles.mine} data-mine d={geometry.mine} />

        <g data-meteor>
          <circle r="13" fill="url(#fate-glow)" />
          <circle r="3.6" fill="#f3d18d" />
        </g>

        <text
          className={styles.youText}
          data-late
          x={geometry.labelRight ? geometry.markerX - 12 : geometry.markerX + 12}
          y={Math.max(PAD.top + 10, geometry.markerY - 10)}
          textAnchor={geometry.labelRight ? 'end' : 'start'}
        >
          your {formatNumber(pulls)}
        </text>
      </svg>

      <figcaption className={styles.caption}>
        Chance of getting them by each pull. Gold is what your stash covers.
      </figcaption>

      {/* The chart's data, for anyone not reading the picture (DESIGN.md). */}
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
              <th scope="col">Pulls</th>
              <th scope="col">Chance</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.floor(geometry.xMax / 10) + 1 }, (_, i) => i * 10).map(
              (t) => (
                <tr key={t}>
                  <th scope="row">{t}</th>
                  <td>{formatPercent(curve[Math.min(t, curve.length - 1)])}%</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
