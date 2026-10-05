'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import screen from '@/components/screen.module.css';
import { AnswerBlock } from '@/components/ui';
import { wishSummary } from '@/db/wishes';
import type { HistorySummary } from '@/engine/wish/history';
import { expectedFiveStars, luckierThan } from '@/engine/wish/luck';
import { EXPECTED_PULLS_PER_5STAR, HARD_PITY } from '@/engine/wish/pity';
import { formatNumber } from '@/lib/format';
import { useTweenedNumeral } from '@/motion';
import { readOr } from '@/lib/storage';

import styles from './LuckScreen.module.css';

/**
 * How lucky the player's pulls actually were.
 *
 * The headline is a percentile rather than an average, because an average
 * cannot tell a three-pull streak from a forty-pull run. It comes from the
 * exact distribution of pulls per 5★ — the same model that produces the
 * planner's odds, read backwards (src/engine/wish/luck.ts).
 */

function verdict(luck: number): string {
  if (luck >= 0.95) return 'Remarkable.';
  if (luck >= 0.75) return 'Lucky.';
  if (luck >= 0.25) return 'About par.';
  if (luck >= 0.05) return 'Unlucky.';
  return 'Brutal.';
}

export function LuckScreen() {
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readOr(wishSummary, null).then((result) => {
      if (cancelled) return;
      setSummary(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fiveStars = summary?.fiveStars ?? [];
  // Only the pulls that produced a 5★ count. The pity built up since the last
  // one is an unfinished attempt and says nothing yet.
  const spent = fiveStars.reduce((sum, event) => sum + event.pity, 0);
  const luck = luckierThan(fiveStars.length, spent);

  // Computed above the early return because the hook below cannot sit under
  // one, and counts to its new value rather than snapping.
  const numeral = useTweenedNumeral(luck === null ? null : luck * 100, (value) =>
    Math.round(value).toString(),
  );

  if (!loaded) return <section className={screen.panel} aria-busy="true" />;

  return (
    <section className={screen.panel} aria-labelledby="luck-title">
      <div>
        <p>
          <Link href="/account" className={styles.back}>
            ← Account
          </Link>
        </p>

        {luck === null ? (
          <>
            <h1 className={screen.title} id="luck-title">
              Your luck
            </h1>
            <p className={styles.empty}>
              Nothing to judge yet. Import your wish history on the Account screen and this fills in
              — every 5★, what it cost, and how that compares with the model.
            </p>
          </>
        ) : (
          <>
            <AnswerBlock
              title="Your luck"
              titleId="luck-title"
              value={Math.round(luck * 100).toString()}
              valueRef={numeral}
              unit="%"
              valueLabel={`luckier than ${Math.round(luck * 100)} percent`}
            >
              <>
                of players would still be waiting for the{' '}
                <strong>{formatNumber(fiveStars.length)}</strong>{' '}
                {fiveStars.length === 1 ? '5★' : '5★s'} you have. <strong>{verdict(luck)}</strong>
              </>
            </AnswerBlock>

            <ul className={styles.stats}>
              <li className={styles.stat}>
                <span className={styles.statLabel}>Average pulls per 5★</span>
                <span className={styles.statValue}>
                  {summary!.averagePity!.toFixed(1)} vs {EXPECTED_PULLS_PER_5STAR.toFixed(1)}{' '}
                  expected
                </span>
              </li>
              <li className={styles.stat}>
                <span className={styles.statLabel}>5★s for the pulls you spent</span>
                <span className={styles.statValue}>
                  {fiveStars.length} vs {expectedFiveStars(summary!.totalPulls).toFixed(1)} expected
                </span>
              </li>
              <li className={styles.stat}>
                <span className={styles.statLabel}>50/50 record</span>
                <span className={styles.statValue}>
                  {summary!.fiftyFiftyWins} of {summary!.fiftyFiftyWins + summary!.fiftyFiftyLosses}
                </span>
              </li>
              <li className={styles.stat}>
                <span className={styles.statLabel}>Pulls counted</span>
                <span className={styles.statValue}>{formatNumber(summary!.totalPulls)}</span>
              </li>
            </ul>
          </>
        )}
      </div>

      {fiveStars.length > 0 ? (
        <div className={screen.colSide}>
          <h2 className={screen.sec}>Every 5★</h2>
          <ul className={styles.pulls} aria-label="Every 5-star, newest last">
            {fiveStars.map((event) => (
              <li className={styles.pull} key={event.id}>
                <span className={styles.name}>{event.name}</span>
                <span className={styles.pity}>{event.pity} pity</span>
                <span className={styles.bar}>
                  {/* Width against hard pity, so the shape of the run is readable at a glance. */}
                  <span
                    className={`${styles.barFill} ${event.featured ? '' : styles.lost}`}
                    style={{
                      width: `${Math.min(100, (event.pity / HARD_PITY) * 100).toFixed(1)}%`,
                    }}
                  />
                </span>
                {!event.featured || event.wasGuaranteed ? (
                  <span className={styles.tag}>
                    {event.wasGuaranteed
                      ? 'Guaranteed, not a coin flip'
                      : 'Standard — a lost 50/50'}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <p className={screen.caption}>
            Guaranteed pulls are kept out of the 50/50 record — they weren&rsquo;t coin flips.
          </p>
        </div>
      ) : null}
    </section>
  );
}
