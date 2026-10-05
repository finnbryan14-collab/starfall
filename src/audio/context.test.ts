import { afterEach, describe, expect, it, vi } from 'vitest';

import { audio, isMuted, resetAudio, setMuted, subscribeToMute } from './context';

/**
 * The guarantees the audio layer makes, which are all about silence.
 *
 * A muted app plays nothing, a browser without Web Audio plays nothing, and a
 * browser that refuses to build a context plays nothing rather than throwing
 * into the middle of a build calculation. The sounds themselves are oscillators
 * and envelopes and are not usefully assertable here — what matters is that
 * none of them can be reached when they should not be.
 */

/** The smallest AudioContext that the module will accept. */
function stubAudioContext() {
  const gain = {
    gain: {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };

  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };

  // A regular function, not an arrow: the module calls `new` on this, and an
  // arrow function cannot be constructed.
  const Constructor = vi.fn(function fakeAudioContext() {
    return context;
  });
  vi.stubGlobal('AudioContext', Constructor);
  return { context, gain, Constructor };
}

afterEach(() => {
  resetAudio();
  vi.unstubAllGlobals();
});

describe('mute', () => {
  it('starts muted, which is the safe state before anything is loaded', () => {
    expect(isMuted()).toBe(true);
  });

  it('tells a listener when it changes', () => {
    const listener = vi.fn();
    const stop = subscribeToMute(listener);

    setMuted(false);
    expect(listener).toHaveBeenCalledOnce();

    stop();
    setMuted(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  /** A control re-rendering on every set would flicker for no reason. */
  it('says nothing when the value has not actually changed', () => {
    const listener = vi.fn();
    const stop = subscribeToMute(listener);

    setMuted(true);
    expect(listener).not.toHaveBeenCalled();

    stop();
  });
});

describe('audio', () => {
  it('is unreachable while muted, so every sound needs one guard and no more', () => {
    stubAudioContext();
    expect(audio()).toBeNull();
  });

  it('builds a context once sound is on', () => {
    const { Constructor } = stubAudioContext();
    setMuted(false);

    expect(audio()).not.toBeNull();
    expect(Constructor).toHaveBeenCalledOnce();
  });

  it('reuses the context rather than building one per sound', () => {
    const { Constructor } = stubAudioContext();
    setMuted(false);

    audio();
    audio();
    audio();

    expect(Constructor).toHaveBeenCalledOnce();
  });

  /**
   * A context built before a user gesture starts suspended, and one that has
   * been backgrounded can be suspended again later.
   */
  it('resumes a suspended context', () => {
    const { context } = stubAudioContext();
    context.state = 'suspended';
    setMuted(false);

    audio();
    expect(context.resume).toHaveBeenCalled();
  });

  it('is null in a browser with no Web Audio at all', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    setMuted(false);

    expect(audio()).toBeNull();
  });

  /**
   * Some locked-down browsers refuse to construct one. Silence is an acceptable
   * outcome; throwing into the middle of a build calculation is not.
   */
  it('is null rather than throwing when the browser refuses', () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        throw new Error('blocked');
      }),
    );
    setMuted(false);

    expect(() => audio()).not.toThrow();
    expect(audio()).toBeNull();
  });

  it('ramps the master gain rather than switching it, so muting does not click', () => {
    const { gain } = stubAudioContext();
    setMuted(false);
    audio();

    setMuted(true);
    expect(gain.gain.setTargetAtTime).toHaveBeenCalled();
    expect(gain.gain.cancelScheduledValues).toHaveBeenCalled();
  });
});
