/**
 * The audio context, and the rules around it.
 *
 * Nothing here ships a file. Every sound is synthesised from oscillators and
 * filtered noise, which means no licensing, no bytes on the wire, and no
 * decision about whose music this is. It also means the sounds are a few lines
 * of maths that can be tuned from code rather than re-exported from a DAW.
 *
 * ## Three rules it exists to enforce
 *
 * **Nothing plays before a gesture.** Browsers suspend an AudioContext created
 * without one, and a resumed-too-early context is a console warning on every
 * load. So the context is built lazily on the first real interaction.
 *
 * **Sound follows motion's rule.** It responds to something the player did,
 * never to a page loading. That is enforced at the call sites — this layer only
 * guarantees that a muted app is silent.
 *
 * **Muting is remembered.** Someone who turns sound off at work should not have
 * to do it again tomorrow. Persistence lives in src/audio/settings.ts; this
 * module holds the live state the sounds read.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = true;

/** Listeners for the mute state, so a control can render the current value. */
const listeners = new Set<() => void>();

/** Full volume is still fairly quiet: these play over whatever else is on. */
const MASTER_GAIN = 0.35;

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToMute(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMuted(): boolean {
  return muted;
}

/** Assumed muted on the server, which is also the safe default everywhere. */
export function isMutedOnServer(): boolean {
  return true;
}

/**
 * Sets the live mute state.
 *
 * Does not persist — see src/audio/settings.ts. Split so the sounds can read a
 * synchronous value without any of them knowing about IndexedDB.
 */
export function setMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  if (master && context) {
    // Ramped rather than switched, so muting mid-sound does not click.
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(next ? 0 : MASTER_GAIN, context.currentTime, 0.02);
  }
  notify();
}

/**
 * The context, built on first use and resumed if the browser suspended it.
 *
 * Returns null when audio is muted or unavailable, which is what lets every
 * sound start with one guard and no branching after it.
 */
export function audio(): { context: AudioContext; master: GainNode } | null {
  if (muted) return null;

  if (!context) {
    // Read off globalThis rather than window: it is the same object in a
    // browser, it exists on the server, and it is the one a test can replace.
    const global = globalThis as typeof globalThis & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Constructor = global.AudioContext ?? global.webkitAudioContext;
    if (!Constructor) return null;

    try {
      context = new Constructor();
    } catch {
      // Some locked-down browsers refuse outright. Silence is an acceptable
      // outcome; a thrown error on a build calculation is not.
      return null;
    }

    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
  }

  // A context created before a gesture starts suspended, and one that has been
  // backgrounded can be suspended again later.
  if (context.state === 'suspended') void context.resume();

  return master ? { context, master } : null;
}

/** Test seam: drops the context so the next call builds a fresh one. */
export function resetAudio(): void {
  void context?.close().catch(() => {});
  context = null;
  master = null;
  muted = true;
  notify();
}
