import { describe, expect, it } from 'vitest';

import { MS_PER_HOUR, MS_PER_MINUTE } from '../time';
import { dueReminders, nextReminder } from './reminders';
import { RESIN_CAP, RESIN_MINUTES_PER_POINT, TRANSFORMER_COOLDOWN_HOURS } from './model';

const now = new Date('2026-09-29T12:00:00Z');
const at = now.getTime();

describe('resin reminder', () => {
  it('fires when the last reading would reach the cap', () => {
    const [reminder] = dueReminders({ now, resin: { setAt: at, value: 0 } });

    expect(reminder.kind).toBe('resin-full');
    expect(reminder.at).toBe(at + RESIN_CAP * RESIN_MINUTES_PER_POINT * MS_PER_MINUTE);
  });

  it('counts from when the reading was taken, not from now', () => {
    // Four hours ago at 60 resin: 30 points have accrued since, so the cap is
    // (200 - 60) * 8 minutes after that moment, not after this one.
    const setAt = at - 4 * MS_PER_HOUR;
    const [reminder] = dueReminders({ now, resin: { setAt, value: 60 } });

    expect(reminder.at).toBe(setAt + (RESIN_CAP - 60) * RESIN_MINUTES_PER_POINT * MS_PER_MINUTE);
  });

  it('says nothing when resin is already full', () => {
    expect(dueReminders({ now, resin: { setAt: at, value: RESIN_CAP } })).toEqual([]);
    // A reading old enough to have filled long ago is the same case.
    expect(dueReminders({ now, resin: { setAt: at - 100 * MS_PER_HOUR, value: 0 } })).toEqual([]);
  });

  it('can warn short of the cap, which is the point of warning at all', () => {
    const [reminder] = dueReminders({ now, resin: { setAt: at, value: 0 }, resinThreshold: 160 });

    expect(reminder.at).toBe(at + 160 * RESIN_MINUTES_PER_POINT * MS_PER_MINUTE);
    expect(reminder.title).toContain('160');
    expect(reminder.body).toContain('40');
  });

  it('never warns above the cap, however the threshold is set', () => {
    const [reminder] = dueReminders({ now, resin: { setAt: at, value: 0 }, resinThreshold: 999 });
    expect(reminder.at).toBe(at + RESIN_CAP * RESIN_MINUTES_PER_POINT * MS_PER_MINUTE);
  });
});

describe('transformer reminder', () => {
  it('fires one cooldown after it was used', () => {
    const usedAt = at - 10 * MS_PER_HOUR;
    const [reminder] = dueReminders({ now, transformer: { usedAt } });

    expect(reminder.kind).toBe('transformer-ready');
    expect(reminder.at).toBe(usedAt + TRANSFORMER_COOLDOWN_HOURS * MS_PER_HOUR);
  });

  it('says nothing when it is already off cooldown', () => {
    const usedAt = at - (TRANSFORMER_COOLDOWN_HOURS + 1) * MS_PER_HOUR;
    expect(dueReminders({ now, transformer: { usedAt } })).toEqual([]);
  });
});

describe('scheduling', () => {
  it('returns nothing when no timer has been set', () => {
    expect(dueReminders({ now })).toEqual([]);
    expect(nextReminder({ now })).toBeNull();
  });

  it('puts the soonest first', () => {
    const reminders = dueReminders({
      now,
      // Resin fills in 8 hours; the transformer has 100 to go.
      resin: { setAt: at, value: RESIN_CAP - 60 },
      transformer: { usedAt: at - (TRANSFORMER_COOLDOWN_HOURS - 100) * MS_PER_HOUR },
    });

    expect(reminders.map((r) => r.kind)).toEqual(['resin-full', 'transformer-ready']);
    expect(nextReminder({ now, resin: { setAt: at, value: RESIN_CAP - 60 } })?.kind).toBe(
      'resin-full',
    );
  });

  /**
   * A notification that arrives the moment it is scheduled tells the player
   * something they could have seen by opening the app — and once sent there is
   * no taking it back.
   */
  it('never schedules something already due', () => {
    const reminders = dueReminders({
      now,
      resin: { setAt: at - 50 * MS_PER_HOUR, value: 0 },
      transformer: { usedAt: at - 500 * MS_PER_HOUR },
    });

    expect(reminders).toEqual([]);
  });

  it('gives every reminder something worth reading', () => {
    const reminders = dueReminders({
      now,
      resin: { setAt: at, value: 0 },
      transformer: { usedAt: at },
    });

    expect(reminders).toHaveLength(2);
    for (const reminder of reminders) {
      expect(reminder.title.length, reminder.kind).toBeGreaterThan(5);
      // The body has to say what to do, not just what happened.
      expect(reminder.body.length, reminder.kind).toBeGreaterThan(20);
      expect(reminder.at, reminder.kind).toBeGreaterThan(at);
    }
  });
});
