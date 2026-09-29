import { mulberry32 } from '@/engine/rng';

import styles from './Starfield.module.css';

/**
 * The fixed star chart behind every screen.
 *
 * Seeded and computed at render time, so the sky is identical on the server and
 * the client and identical between reloads — it is scenery, not noise. Nothing
 * here animates: DESIGN.md rules out looping ambient motion.
 */

const SEED = 2026;
const STAR_COUNT = 90;
const VIEWBOX = 1000;

type Star = { cx: string; cy: string; r: string; opacity: string };

function generateStars(): Star[] {
  const rng = mulberry32(SEED);
  return Array.from({ length: STAR_COUNT }, () => ({
    cx: (rng() * VIEWBOX).toFixed(1),
    cy: (rng() * VIEWBOX).toFixed(1),
    // Squaring the random term keeps most stars small and a few noticeably brighter.
    r: (0.6 + rng() * rng() * 2.2).toFixed(2),
    opacity: (0.1 + rng() * 0.35).toFixed(2),
  }));
}

export function Starfield() {
  const stars = generateStars();

  return (
    <svg
      className={styles.sky}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {stars.map((star, i) => (
        <circle
          key={i}
          cx={star.cx}
          cy={star.cy}
          r={star.r}
          fill="var(--starlight)"
          opacity={star.opacity}
        />
      ))}
    </svg>
  );
}
