import { describe, expect, it } from 'vitest';

import {
  DAILY_RESET_HOUR,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  nextDailyReset,
  nextWeeklyReset,
} from '@/engine/time';
import {
  EXPEDITION_DURATIONS_HOURS,
  RESIN_CAP,
  RESIN_MINUTES_PER_POINT,
  TRANSFORMER_COOLDOWN_HOURS,
  expeditionAt,
  realmCurrencyAt,
  resinAt,
  transformerAt,
} from '@/engine/timers/model';

const at = (iso: string) => new Date(iso).getTime();

describe('resin', () => {
  it('regenerates one every eight minutes, capped at 200', () => {
    expect(RESIN_MINUTES_PER_POINT).toBe(8);
    expect(RESIN_CAP).toBe(200);
    // 200 x 8 minutes is 26 hours 40 minutes from empty to full.
    expect((RESIN_CAP * RESIN_MINUTES_PER_POINT) / 60).toBeCloseTo(26 + 40 / 60, 9);
  });

  it('adds one point per eight minutes', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    expect(resinAt({ setAt, value: 100 }, new Date(setAt)).value).toBe(100);
    expect(resinAt({ setAt, value: 100 }, new Date(setAt + 8 * MS_PER_MINUTE)).value).toBe(101);
    expect(resinAt({ setAt, value: 100 }, new Date(setAt + 80 * MS_PER_MINUTE)).value).toBe(110);
  });

  it('does not credit a partial interval', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    expect(resinAt({ setAt, value: 100 }, new Date(setAt + 7 * MS_PER_MINUTE)).value).toBe(100);
  });

  /** ROADMAP: values are correct after a simulated 10-hour gap. */
  it('is right after the app has been closed for ten hours', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const later = new Date(setAt + 10 * MS_PER_HOUR);
    // 10 hours is 600 minutes, so 75 points.
    expect(resinAt({ setAt, value: 100 }, later).value).toBe(175);
  });

  it('stops at the cap rather than running past it', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const muchLater = new Date(setAt + 200 * MS_PER_HOUR);
    const state = resinAt({ setAt, value: 100 }, muchLater);
    expect(state.value).toBe(RESIN_CAP);
    expect(state.full).toBe(true);
    expect(state.untilFullMs).toBe(0);
  });

  it('says when it will be full', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const state = resinAt({ setAt, value: 143 }, new Date(setAt));
    // 57 points to go, at 8 minutes each, is 7 hours 36 minutes.
    expect(state.untilFullMs).toBe(57 * 8 * MS_PER_MINUTE);
    expect(state.fullAt?.getTime()).toBe(setAt + 57 * 8 * MS_PER_MINUTE);
  });

  it('is already full when set at the cap', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const state = resinAt({ setAt, value: RESIN_CAP }, new Date(setAt));
    expect(state.full).toBe(true);
    expect(state.fullAt).toBeNull();
  });

  it('never reports more than the cap even if set above it', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    expect(resinAt({ setAt, value: 999 }, new Date(setAt)).value).toBe(RESIN_CAP);
  });

  it('does not run backwards if the clock is behind the reading', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const earlier = new Date(setAt - 5 * MS_PER_HOUR);
    expect(resinAt({ setAt, value: 100 }, earlier).value).toBe(100);
  });

  it('rejects a negative reading', () => {
    expect(() => resinAt({ setAt: 0, value: -1 }, new Date(0))).toThrow();
  });
});

describe('parametric transformer', () => {
  it('is 6 days 22 hours, not the 7 days the gadget claims', () => {
    expect(TRANSFORMER_COOLDOWN_HOURS).toBe(166);
    expect(TRANSFORMER_COOLDOWN_HOURS).toBe(6 * 24 + 22);
  });

  it('is on cooldown right after use', () => {
    const usedAt = at('2026-09-29T12:00:00Z');
    const state = transformerAt({ usedAt }, new Date(usedAt));
    expect(state.ready).toBe(false);
    expect(state.untilReadyMs).toBe(TRANSFORMER_COOLDOWN_HOURS * MS_PER_HOUR);
  });

  it('is ready exactly at the end of the cooldown', () => {
    const usedAt = at('2026-09-29T12:00:00Z');
    const ready = new Date(usedAt + TRANSFORMER_COOLDOWN_HOURS * MS_PER_HOUR);
    expect(transformerAt({ usedAt }, ready).ready).toBe(true);
    expect(transformerAt({ usedAt }, new Date(ready.getTime() - 1)).ready).toBe(false);
  });

  it('stays ready afterwards rather than going negative', () => {
    const usedAt = at('2026-09-29T12:00:00Z');
    const state = transformerAt({ usedAt }, new Date(usedAt + 400 * MS_PER_HOUR));
    expect(state.ready).toBe(true);
    expect(state.untilReadyMs).toBe(0);
  });

  it('reports the fraction of the cooldown elapsed', () => {
    const usedAt = at('2026-09-29T12:00:00Z');
    const halfway = new Date(usedAt + (TRANSFORMER_COOLDOWN_HOURS / 2) * MS_PER_HOUR);
    expect(transformerAt({ usedAt }, halfway).progress).toBeCloseTo(0.5, 9);
  });
});

describe('expeditions', () => {
  it('offers the durations the game does', () => {
    expect(EXPEDITION_DURATIONS_HOURS).toEqual([4, 8, 12, 20]);
  });

  it('finishes after its duration', () => {
    const startedAt = at('2026-09-29T12:00:00Z');
    const eight = { startedAt, hours: 8 as const };
    expect(expeditionAt(eight, new Date(startedAt)).done).toBe(false);
    expect(expeditionAt(eight, new Date(startedAt + 8 * MS_PER_HOUR)).done).toBe(true);
  });

  it('counts down without going negative', () => {
    const startedAt = at('2026-09-29T12:00:00Z');
    const state = expeditionAt({ startedAt, hours: 4 }, new Date(startedAt + 40 * MS_PER_HOUR));
    expect(state.untilDoneMs).toBe(0);
    expect(state.progress).toBe(1);
  });

  it('rejects a duration the game does not offer', () => {
    // @ts-expect-error deliberately invalid duration
    expect(() => expeditionAt({ startedAt: 0, hours: 5 }, new Date(0))).toThrow();
  });
});

describe('realm currency', () => {
  it('accrues at the teapot rate up to its cap', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const state = realmCurrencyAt(
      { setAt, value: 1_840, ratePerHour: 30, cap: 2_400 },
      new Date(setAt + 10 * MS_PER_HOUR),
    );
    // 1,840 + 300 is 2,140, still under the cap.
    expect(state.value).toBe(2_140);
    expect(state.full).toBe(false);
  });

  it('stops at the cap', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const state = realmCurrencyAt(
      { setAt, value: 1_840, ratePerHour: 30, cap: 2_400 },
      new Date(setAt + 100 * MS_PER_HOUR),
    );
    expect(state.value).toBe(2_400);
    expect(state.full).toBe(true);
  });

  it('never accrues at a zero rate', () => {
    const setAt = at('2026-09-29T12:00:00Z');
    const state = realmCurrencyAt(
      { setAt, value: 100, ratePerHour: 0, cap: 2_400 },
      new Date(setAt + 100 * MS_PER_HOUR),
    );
    expect(state.value).toBe(100);
    expect(state.fullAt).toBeNull();
  });

  it('rejects a cap below the current value', () => {
    expect(() =>
      realmCurrencyAt({ setAt: 0, value: 500, ratePerHour: 30, cap: 100 }, new Date(0)),
    ).toThrow();
  });
});

describe('resets on the America server', () => {
  it('turns the day at 04:00 server time, which is 09:00 UTC', () => {
    // 08:00 UTC is before the reset; the next one is the same day at 09:00.
    expect(nextDailyReset(new Date('2026-09-29T08:00:00Z')).toISOString()).toBe(
      '2026-09-29T09:00:00.000Z',
    );
    // 10:00 UTC is past it; the next one is tomorrow.
    expect(nextDailyReset(new Date('2026-09-29T10:00:00Z')).toISOString()).toBe(
      '2026-09-30T09:00:00.000Z',
    );
  });

  it('treats the reset instant itself as already past', () => {
    expect(nextDailyReset(new Date('2026-09-29T09:00:00Z')).toISOString()).toBe(
      '2026-09-30T09:00:00.000Z',
    );
  });

  it('turns the week on the server Monday', () => {
    // 2026-09-29 is a Tuesday, so the next weekly reset is Monday 2026-10-05.
    const weekly = nextWeeklyReset(new Date('2026-09-29T12:00:00Z'));
    expect(weekly.toISOString()).toBe('2026-10-05T09:00:00.000Z');

    // Shifted into server time, that instant really is a Monday.
    const serverLocal = new Date(weekly.getTime() - 5 * MS_PER_HOUR);
    expect(serverLocal.getUTCDay()).toBe(1);
  });

  it('does not skip a week when asked on a Monday before the reset', () => {
    // Monday 2026-10-05 at 08:00 UTC is an hour before that day's 09:00 reset.
    expect(nextWeeklyReset(new Date('2026-10-05T08:00:00Z')).toISOString()).toBe(
      '2026-10-05T09:00:00.000Z',
    );
  });

  it('rolls to the following Monday once this one has passed', () => {
    expect(nextWeeklyReset(new Date('2026-10-05T10:00:00Z')).toISOString()).toBe(
      '2026-10-12T09:00:00.000Z',
    );
  });

  it('honours a different server offset', () => {
    // Asia is UTC+8, so 04:00 server time is 20:00 UTC the previous day.
    expect(nextDailyReset(new Date('2026-09-29T12:00:00Z'), 8).toISOString()).toBe(
      '2026-09-29T20:00:00.000Z',
    );
  });
});

/**
 * Servers ahead of UTC reset at a *negative* UTC hour: Asia's 4:00 is 20:00 the
 * previous UTC day. That is the case the one-example test above happens to
 * miss, and it was broken — from 20:00 UTC onwards the "next" reset landed in
 * the past and the Timers screen read "In 0 min" for the rest of the day.
 *
 * Swept across the whole day rather than sampled, because which hour you ask at
 * is precisely what decides whether the bug shows.
 */
describe('resets on every server, at every hour', () => {
  const OFFSETS = [-5, 1, 8];

  const from = (hour: number) => new Date(Date.UTC(2026, 8, 29, hour, 30, 0));

  it('is always strictly in the future', () => {
    const wrong: string[] = [];

    for (const offset of OFFSETS) {
      for (let hour = 0; hour < 24; hour++) {
        const at = from(hour);
        const reset = nextDailyReset(at, offset);
        if (reset.getTime() <= at.getTime()) {
          wrong.push(`offset ${offset} at ${hour}:30Z gave ${reset.toISOString()}`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it('is always 4:00 on the server clock, and never more than a day out', () => {
    const wrongHour: string[] = [];
    const tooFar: string[] = [];

    for (const offset of OFFSETS) {
      for (let hour = 0; hour < 24; hour++) {
        const at = from(hour);
        const reset = nextDailyReset(at, offset);
        const serverLocal = new Date(reset.getTime() + offset * MS_PER_HOUR);

        if (serverLocal.getUTCHours() !== DAILY_RESET_HOUR) {
          wrongHour.push(`offset ${offset} at ${hour}:30Z`);
        }
        if (reset.getTime() - at.getTime() > MS_PER_DAY) {
          tooFar.push(`offset ${offset} at ${hour}:30Z`);
        }
      }
    }

    expect(wrongHour).toEqual([]);
    expect(tooFar).toEqual([]);
  });

  it('gives Asia the evening after, not the one just gone', () => {
    // 22:56 UTC is past Asia's 20:00 reset for that day.
    expect(nextDailyReset(new Date('2026-09-29T22:56:00Z'), 8).toISOString()).toBe(
      '2026-09-30T20:00:00.000Z',
    );
  });

  it('still lands on a Monday for a server ahead of UTC', () => {
    const at = new Date('2026-09-29T22:56:00Z');
    const weekly = nextWeeklyReset(at, 8);

    expect(weekly.getTime()).toBeGreaterThan(at.getTime());
    expect(new Date(weekly.getTime() + 8 * MS_PER_HOUR).getUTCDay()).toBe(1);
  });
});
