import { MS_PER_HOUR } from '../time';
import { TRANSFORMER_COOLDOWN_HOURS } from './model';

/**
 * Turning HoYoLAB's real-time notes into timer readings.
 *
 * A timer is stored as a value and the moment it was true (src/db/timers), and
 * everything shown is derived from that pair. The notes give current values and
 * *countdowns*, so the countdowns have to be run backwards into the moment the
 * timer started — otherwise a transformer with 2 hours left would be recorded
 * as one used just now, and say 166 hours.
 */

export type NotesReading = {
  resin: number;
  realmCurrency: number;
  /** Seconds until the Parametric Transformer is ready, or null if unobtained. */
  transformerSeconds: number | null;
};

export type TimerReading = {
  value: number;
  /** Epoch ms the value was true of. */
  setAt: number;
};

export type TimersFromNotes = {
  resin: TimerReading;
  realmCurrency: TimerReading;
  /** Absent when the gadget is not owned, so an existing timer is left alone. */
  transformer?: TimerReading;
};

const TRANSFORMER_COOLDOWN_MS = TRANSFORMER_COOLDOWN_HOURS * MS_PER_HOUR;

export function timersFromNotes(notes: NotesReading, now: Date): TimersFromNotes {
  const at = now.getTime();

  const timers: TimersFromNotes = {
    resin: { value: notes.resin, setAt: at },
    realmCurrency: { value: notes.realmCurrency, setAt: at },
  };

  if (notes.transformerSeconds !== null) {
    // The transformer timer stores when it was *used*. Remaining time runs
    // backwards from the full cooldown; a countdown of zero means it is ready,
    // which is a use one whole cooldown ago.
    //
    // Clamped to the cooldown at the top end: a longer countdown would put the
    // use in the future, and the timer would then read as freshly used rather
    // than nearly ready. That should not happen, but if HoYoverse changes the
    // cooldown before we notice, this is the direction to be wrong in.
    const remainingMs = Math.min(
      TRANSFORMER_COOLDOWN_MS,
      Math.max(0, notes.transformerSeconds * 1_000),
    );
    timers.transformer = { value: 0, setAt: at - (TRANSFORMER_COOLDOWN_MS - remainingMs) };
  }

  return timers;
}
