import { describe, expect, it } from 'vitest';

import { MS_PER_HOUR } from '../time';
import { timersFromNotes } from './from-notes';
import { transformerAt, TRANSFORMER_COOLDOWN_HOURS } from './model';

const now = new Date('2026-09-29T12:00:00Z');

describe('timersFromNotes', () => {
  it('records resin and realm currency as true right now', () => {
    const timers = timersFromNotes(
      { resin: 84, realmCurrency: 1_200, transformerSeconds: null },
      now,
    );

    expect(timers.resin).toEqual({ value: 84, setAt: now.getTime() });
    expect(timers.realmCurrency).toEqual({ value: 1_200, setAt: now.getTime() });
  });

  /**
   * The countdown has to be run backwards into a start time. Storing "used
   * now" for a transformer with two hours left would tell the player to wait
   * another 166.
   */
  it('runs the transformer countdown backwards into when it was used', () => {
    const twoHours = 2 * 3_600;
    const timers = timersFromNotes(
      { resin: 0, realmCurrency: 0, transformerSeconds: twoHours },
      now,
    );

    const state = transformerAt({ usedAt: timers.transformer!.setAt }, now);
    expect(state.ready).toBe(false);
    expect(state.untilReadyMs).toBe(2 * MS_PER_HOUR);
  });

  it('treats a countdown of zero as ready', () => {
    const timers = timersFromNotes({ resin: 0, realmCurrency: 0, transformerSeconds: 0 }, now);

    const state = transformerAt({ usedAt: timers.transformer!.setAt }, now);
    expect(state.ready).toBe(true);
    expect(timers.transformer!.setAt).toBe(
      now.getTime() - TRANSFORMER_COOLDOWN_HOURS * MS_PER_HOUR,
    );
  });

  it('leaves the transformer alone when the gadget is not owned', () => {
    const timers = timersFromNotes({ resin: 0, realmCurrency: 0, transformerSeconds: null }, now);
    expect(timers.transformer).toBeUndefined();
  });

  it('never records a use in the future from a countdown past the cooldown', () => {
    const silly = (TRANSFORMER_COOLDOWN_HOURS + 100) * 3_600;
    const timers = timersFromNotes({ resin: 0, realmCurrency: 0, transformerSeconds: silly }, now);

    expect(timers.transformer!.setAt).toBeLessThanOrEqual(now.getTime());
  });
});
