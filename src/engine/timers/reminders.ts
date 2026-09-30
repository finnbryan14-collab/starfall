import { MS_PER_HOUR, MS_PER_MINUTE } from '../time';
import { RESIN_CAP, RESIN_MINUTES_PER_POINT, TRANSFORMER_COOLDOWN_HOURS } from './model';

/**
 * When a timer is worth interrupting someone for.
 *
 * Resin overflowing and the Parametric Transformer coming off cooldown are the
 * two things that cost you something by being missed, and both are exactly
 * predictable from a stored reading — no polling, no guessing.
 *
 * Pure on purpose. Whatever ends up delivering the notification, the question
 * "when should it fire" has one answer and it is testable without a browser or
 * a push service.
 *
 * docs/MATH.md section 5.
 */

export type ReminderKind = 'resin-full' | 'transformer-ready';

export type Reminder = {
  kind: ReminderKind;
  /** Epoch ms the notification should arrive. Always in the future. */
  at: number;
  title: string;
  body: string;
};

export type ReminderInput = {
  /** The last resin reading: what it was, and when. */
  resin?: { setAt: number; value: number };
  /** When the transformer was last used. */
  transformer?: { usedAt: number };
  now: Date;
  /**
   * Warn at this much resin rather than at the cap.
   *
   * Overflow is the thing worth avoiding, and being told at the moment it
   * starts is already too late — by then you are losing resin while you find
   * your phone. A player who wants the margin sets this below the cap.
   */
  resinThreshold?: number;
  resinCap?: number;
};

/** Minutes for resin to climb from `value` to `threshold`. */
function minutesToResin(value: number, threshold: number): number {
  return Math.max(0, threshold - value) * RESIN_MINUTES_PER_POINT;
}

/**
 * The reminders worth scheduling, soonest first.
 *
 * Anything already due is left out rather than returned with a past time: a
 * notification that fires the instant it is scheduled tells the player
 * something they could have seen by opening the app, and there is no way to
 * un-send it.
 */
export function dueReminders(input: ReminderInput): Reminder[] {
  const { resin, transformer, now } = input;
  const cap = input.resinCap ?? RESIN_CAP;
  const threshold = Math.min(cap, input.resinThreshold ?? cap);
  const at = now.getTime();

  const reminders: Reminder[] = [];

  if (resin) {
    const full = resin.setAt + minutesToResin(resin.value, threshold) * MS_PER_MINUTE;
    if (full > at) {
      reminders.push({
        kind: 'resin-full',
        at: full,
        title: threshold >= cap ? 'Resin is full' : `Resin has reached ${threshold}`,
        body:
          threshold >= cap
            ? 'Anything you earn from here is wasted. Spend some.'
            : `${cap - threshold} short of the cap. Spend some before it overflows.`,
      });
    }
  }

  if (transformer) {
    const ready = transformer.usedAt + TRANSFORMER_COOLDOWN_HOURS * MS_PER_HOUR;
    if (ready > at) {
      reminders.push({
        kind: 'transformer-ready',
        at: ready,
        title: 'Parametric Transformer is ready',
        body: 'Use it today and the next one lands at the same time next week.',
      });
    }
  }

  return reminders.sort((a, b) => a.at - b.at);
}

/** The soonest reminder, or null when nothing is pending. */
export function nextReminder(input: ReminderInput): Reminder | null {
  return dueReminders(input)[0] ?? null;
}
