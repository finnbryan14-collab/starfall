import { describe, expect, it } from 'vitest';

import {
  ALL_SOURCED_VALUES,
  ASSUMPTIONS_VERIFIED_AT,
  DEFAULT_ASSUMPTIONS,
  PRIMOGEMS_PER_PULL,
} from '@/engine/income/defaults';
import {
  AMERICA_UTC_OFFSET,
  DAILY_RESET_HOUR,
  countDailyResets,
  countMonthlyResets,
  projectIncome,
  pullsAvailable,
} from '@/engine/income/project';

/** 04:00 server time on the America server is 09:00 UTC. */
const utc = (iso: string) => new Date(iso);
const RESET_UTC_HOUR = DAILY_RESET_HOUR - AMERICA_UTC_OFFSET; // 4 - (-5) = 9

describe('sourced defaults', () => {
  it('carries a source and a verifiedAt on every value', () => {
    for (const [name, sourced] of Object.entries(ALL_SOURCED_VALUES)) {
      expect(sourced.source, name).toMatch(/^https:\/\//);
      expect(sourced.verifiedAt, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['official', 'community'], name).toContain(sourced.confidence);
      expect(Number.isFinite(sourced.value), name).toBe(true);
      expect(sourced.value, name).toBeGreaterThan(0);
    }
  });

  it('agrees with the date shown in the income sheet', () => {
    for (const [name, sourced] of Object.entries(ALL_SOURCED_VALUES)) {
      expect(sourced.verifiedAt <= ASSUMPTIONS_VERIFIED_AT, name).toBe(true);
    }
  });

  it('keeps the pull price at 160 primogems', () => {
    expect(PRIMOGEMS_PER_PULL.value).toBe(160);
  });
});

describe('countDailyResets', () => {
  it('counts reset instants strictly after `from` and up to `to`', () => {
    // 10:00 UTC on the 1st is just past that day's 09:00 reset.
    const from = utc('2026-10-01T10:00:00Z');
    const to = utc('2026-10-04T10:00:00Z');
    expect(countDailyResets(from, to)).toBe(3);
  });

  it('is exclusive at the start: a reset exactly at `from` has already paid out', () => {
    const reset = utc('2026-10-01T09:00:00Z');
    expect(countDailyResets(reset, utc('2026-10-01T23:00:00Z'))).toBe(0);
  });

  it('is inclusive at the end: a reset exactly at `to` counts', () => {
    const from = utc('2026-10-01T08:00:00Z');
    const to = utc('2026-10-01T09:00:00Z');
    expect(countDailyResets(from, to)).toBe(1);
  });

  it('turns on the minute, not the hour before or after', () => {
    const justBefore = utc('2026-10-01T08:59:59Z');
    const reset = utc('2026-10-01T09:00:00Z');
    const justAfter = utc('2026-10-01T09:00:01Z');

    expect(countDailyResets(justBefore, justAfter)).toBe(1);
    expect(countDailyResets(reset, justAfter)).toBe(0);
  });

  it('is zero for an empty or backwards range', () => {
    const t = utc('2026-10-05T12:00:00Z');
    expect(countDailyResets(t, t)).toBe(0);
    expect(countDailyResets(t, utc('2026-10-01T12:00:00Z'))).toBe(0);
  });

  it('counts a full year without drifting', () => {
    const from = utc('2026-01-01T10:00:00Z');
    const to = utc('2027-01-01T10:00:00Z');
    expect(countDailyResets(from, to)).toBe(365);
  });

  it('handles the reset hour landing in UTC correctly', () => {
    expect(RESET_UTC_HOUR).toBe(9);
  });

  /**
   * A server ahead of UTC resets at a negative UTC hour — Asia's 4:00 is 20:00
   * the previous UTC day — so the first candidate can be a whole day behind
   * `from`. Stepping it forward by a single day was not always enough, and the
   * resulting reset sat *before* the window, inflating the count by one and
   * with it every Asian player's projected income.
   */
  it('counts the same number of days on every server', () => {
    const from = utc('2026-09-01T22:56:00Z');
    const to = new Date(from.getTime() + 10 * 86_400_000);

    for (const offset of [-5, 1, 8]) {
      // An exactly ten-day window contains exactly ten of any daily instant.
      expect(countDailyResets(from, to, offset), `offset ${offset}`).toBe(10);
    }
  });

  it('does not count a reset that has already gone on an Asian account', () => {
    // 22:56Z is past Asia's 20:00Z reset; the only one in the window is the
    // following evening's.
    expect(countDailyResets(utc('2026-09-29T22:56:00Z'), utc('2026-09-30T21:00:00Z'), 8)).toBe(1);
  });
});

describe('countMonthlyResets', () => {
  it('counts a single reset day across months', () => {
    // Spiral Abyss: the 16th.
    const from = utc('2026-09-28T10:00:00Z');
    const to = utc('2026-12-20T10:00:00Z');
    expect(countMonthlyResets(from, to, 16)).toBe(3); // Oct 16, Nov 16, Dec 16
  });

  it('counts the 1st for the Theater', () => {
    const from = utc('2026-09-28T10:00:00Z');
    const to = utc('2026-12-02T10:00:00Z');
    expect(countMonthlyResets(from, to, 1)).toBe(3); // Oct 1, Nov 1, Dec 1
  });

  it('respects the reset hour on the boundary day', () => {
    // 08:00 UTC on the 16th is before that day's 09:00 reset.
    expect(countMonthlyResets(utc('2026-10-01T10:00:00Z'), utc('2026-10-16T08:00:00Z'), 16)).toBe(
      0,
    );
    expect(countMonthlyResets(utc('2026-10-01T10:00:00Z'), utc('2026-10-16T09:00:00Z'), 16)).toBe(
      1,
    );
  });

  it('is zero when the range contains no reset day', () => {
    expect(countMonthlyResets(utc('2026-10-17T10:00:00Z'), utc('2026-10-31T10:00:00Z'), 16)).toBe(
      0,
    );
  });

  it('crosses a year boundary', () => {
    expect(countMonthlyResets(utc('2026-12-20T10:00:00Z'), utc('2027-01-20T10:00:00Z'), 16)).toBe(
      1,
    );
  });

  it('skips months that are too short for the reset day', () => {
    // There is no 31st in February, April, June, September or November.
    const from = utc('2026-01-01T10:00:00Z');
    const to = utc('2026-12-31T23:00:00Z');
    expect(countMonthlyResets(from, to, 31)).toBe(7);
  });
});

describe('projectIncome', () => {
  const from = utc('2026-09-28T10:00:00Z');
  const to = utc('2026-10-13T10:00:00Z'); // 15 daily resets

  it('counts daily commissions once per reset', () => {
    const result = projectIncome({
      from,
      to,
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { dailyCommissions: true },
    });
    expect(result.days).toBe(15);
    expect(result.breakdown.dailyCommissions).toBe(15 * DEFAULT_ASSUMPTIONS.dailyCommissions);
  });

  /** The case ROADMAP names: Welkin running out partway through the range. */
  it('stops paying Welkin the day it expires', () => {
    const result = projectIncome({
      from,
      to,
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { welkin: true },
      welkinDaysRemaining: 5,
    });
    expect(result.welkinDaysUsed).toBe(5);
    expect(result.breakdown.welkin).toBe(5 * DEFAULT_ASSUMPTIONS.welkinPerDay);
  });

  it('pays Welkin for the whole range when it outlasts it', () => {
    const result = projectIncome({
      from,
      to,
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { welkin: true },
      welkinDaysRemaining: 30,
    });
    expect(result.welkinDaysUsed).toBe(15);
    expect(result.breakdown.welkin).toBe(15 * DEFAULT_ASSUMPTIONS.welkinPerDay);
  });

  it('pays no Welkin when none is left', () => {
    const result = projectIncome({
      from,
      to,
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { welkin: true },
      welkinDaysRemaining: 0,
    });
    expect(result.breakdown.welkin).toBe(0);
  });

  it('counts the Abyss on the 16th and the Theater on the 1st', () => {
    const result = projectIncome({
      from,
      to: utc('2026-10-20T10:00:00Z'),
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { spiralAbyss: true, imaginariumTheater: true },
    });
    // Oct 1 for the Theater, Oct 16 for the Abyss.
    expect(result.resets.imaginariumTheater).toBe(1);
    expect(result.resets.spiralAbyss).toBe(1);
  });

  it('scales endgame income by expected completion', () => {
    const full = projectIncome({
      from,
      to: utc('2026-10-20T10:00:00Z'),
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { spiralAbyss: true },
      endgameCompletion: 1,
    });
    const half = projectIncome({
      from,
      to: utc('2026-10-20T10:00:00Z'),
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { spiralAbyss: true },
      endgameCompletion: 0.5,
    });
    expect(half.breakdown.spiralAbyss).toBeCloseTo(full.breakdown.spiralAbyss / 2, 9);
  });

  it('prorates per-patch income by days in range', () => {
    const result = projectIncome({
      from,
      to,
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { events: true },
    });
    const expected =
      (15 / DEFAULT_ASSUMPTIONS.patchLengthDays) * DEFAULT_ASSUMPTIONS.eventsPerPatch;
    expect(result.breakdown.events).toBeCloseTo(expected, 9);
  });

  /**
   * design/preview.html labels the income row "2,250 from dailies and Welkin,
   * plus your estimate for events" for exactly this range. Our independently
   * sourced defaults have to land on the same number, or one of the two is
   * wrong.
   */
  it("reproduces the preview's stated dailies-and-Welkin figure", () => {
    const result = projectIncome({
      from,
      to,
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { dailyCommissions: true, welkin: true },
      welkinDaysRemaining: 30,
    });
    expect(result.days).toBe(15);
    expect(result.breakdown.dailyCommissions).toBe(900); // 60 x 15
    expect(result.breakdown.welkin).toBe(1350); // 90 x 15
    expect(result.primogems).toBe(2250);
  });

  it('counts nothing that is switched off', () => {
    const result = projectIncome({ from, to, assumptions: DEFAULT_ASSUMPTIONS, enabled: {} });
    expect(result.primogems).toBe(0);
    expect(result.fates).toBe(0);
  });

  it('totals the breakdown exactly', () => {
    const result = projectIncome({
      from,
      to: utc('2026-11-20T10:00:00Z'),
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: {
        dailyCommissions: true,
        welkin: true,
        spiralAbyss: true,
        imaginariumTheater: true,
        events: true,
        compensation: true,
        exploration: true,
        battlePass: true,
        stardustFates: true,
      },
      welkinDaysRemaining: 20,
    });

    const summed = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
    expect(result.primogems).toBeCloseTo(summed, 9);
    expect(result.primogems).toBeGreaterThan(0);
    expect(result.fates).toBeGreaterThan(0);
  });

  it('never returns a negative projection', () => {
    const result = projectIncome({
      from: to,
      to: from, // backwards
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: { dailyCommissions: true, welkin: true },
      welkinDaysRemaining: 30,
    });
    expect(result.days).toBe(0);
    expect(result.primogems).toBe(0);
  });

  it('rejects a negative Welkin balance rather than paying it out', () => {
    expect(() =>
      projectIncome({
        from,
        to,
        assumptions: DEFAULT_ASSUMPTIONS,
        enabled: { welkin: true },
        welkinDaysRemaining: -1,
      }),
    ).toThrow();
  });
});

describe('pullsAvailable', () => {
  it('follows the formula in MATH.md section 3', () => {
    // fates + floor((primogems + income) / 160)
    expect(pullsAvailable({ primogems: 11_200, fates: 14, projectedPrimogems: 3_850 })).toBe(108);
  });

  it('matches the headline example in the preview', () => {
    const pulls = pullsAvailable({ primogems: 11_200, fates: 14, projectedPrimogems: 3_850 });
    expect(pulls).toBe(108);
  });

  it('floors rather than rounding, so it never promises a pull you cannot make', () => {
    expect(pullsAvailable({ primogems: 159, fates: 0, projectedPrimogems: 0 })).toBe(0);
    expect(pullsAvailable({ primogems: 160, fates: 0, projectedPrimogems: 0 })).toBe(1);
    expect(pullsAvailable({ primogems: 319, fates: 0, projectedPrimogems: 0 })).toBe(1);
  });

  it('adds projected fates from the battle pass and the stardust shop', () => {
    expect(
      pullsAvailable({ primogems: 0, fates: 2, projectedPrimogems: 0, projectedFates: 9 }),
    ).toBe(11);
  });

  it('treats missing income as zero', () => {
    expect(pullsAvailable({ primogems: 1_600, fates: 0 })).toBe(10);
  });

  it('rejects negative balances', () => {
    expect(() => pullsAvailable({ primogems: -1, fates: 0 })).toThrow();
    expect(() => pullsAvailable({ primogems: 0, fates: -1 })).toThrow();
  });
});
