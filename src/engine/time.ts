/**
 * Server time.
 *
 * Genshin's day turns over at 04:00 server time, not midnight and not local
 * midnight, so anything that resets daily or weekly is anchored here rather
 * than in each feature.
 *
 * Daily reset at 04:00 server time; the weekly reset is Monday at the same
 * hour, which is also when the Battle Pass and weekly bosses turn over.
 *   source: https://support.hoyoverse.com/hc/en-us/articles/50333950598553-When-does-the-Spiral-Abyss-reset-and-what-are-the-rewards
 *   source: https://genshin-impact.fandom.com/wiki/Parametric_Transformer
 *   verifiedAt: 2026-09-29
 */

export const DAILY_RESET_HOUR = 4;

/**
 * America server, UTC-5. DECISIONS.md records this as the v1 default; it is a
 * parameter throughout so other servers are a change of argument, not of code.
 */
export const AMERICA_UTC_OFFSET = -5;

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** UTC hour at which the server's daily reset falls. */
export function resetHourUtc(utcOffset = AMERICA_UTC_OFFSET): number {
  return DAILY_RESET_HOUR - utcOffset;
}

/**
 * The first daily reset strictly after `from`.
 *
 * The candidate is built from `from`'s UTC date at the reset's UTC hour, which
 * for a server ahead of UTC is *negative* — Asia's 4:00 is 20:00 the previous
 * UTC day. So the candidate can start a whole day behind, and stepping forward
 * by one day is not always enough to clear `from`. Stepping by however many
 * whole days it takes is the same answer for every server and does not care
 * which side of midnight the offset puts the hour on.
 */
export function nextDailyReset(from: Date, utcOffset = AMERICA_UTC_OFFSET): Date {
  const hour = resetHourUtc(utcOffset);
  const candidate = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    hour,
    0,
    0,
    0,
  );

  const days = Math.max(0, Math.floor((from.getTime() - candidate) / MS_PER_DAY) + 1);
  return new Date(candidate + days * MS_PER_DAY);
}

/**
 * The first weekly reset strictly after `from`: Monday at the daily reset hour.
 *
 * "Monday" means the server's Monday. Because the reset is at 04:00 rather than
 * midnight, the instant can land on a Sunday or a Monday in UTC depending on
 * the offset — so the weekday is taken from the shifted server clock, not from
 * the UTC date.
 */
export function nextWeeklyReset(from: Date, utcOffset = AMERICA_UTC_OFFSET): Date {
  let candidate = nextDailyReset(from, utcOffset);

  for (let i = 0; i < 7; i++) {
    // Shift into server-local time to read the weekday the player would see.
    const serverLocal = new Date(candidate.getTime() + utcOffset * MS_PER_HOUR);
    if (serverLocal.getUTCDay() === 1) return candidate;
    candidate = new Date(candidate.getTime() + MS_PER_DAY);
  }

  // Unreachable: one of seven consecutive days is always a Monday.
  return candidate;
}
