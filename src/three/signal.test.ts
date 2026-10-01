import { describe, expect, it, vi } from 'vitest';

import { fireMeteor, onMeteor } from './signal';

/**
 * The sky is in the shell and the moments worth a meteor are on routes that
 * have no reason to know a renderer exists. So this is the whole contract: a
 * screen says what happened, and whether anything is listening is not its
 * problem.
 */

describe('meteor signal', () => {
  it('reaches a listener', () => {
    const listener = vi.fn();
    const stop = onMeteor(listener);

    fireMeteor();
    expect(listener).toHaveBeenCalledOnce();

    stop();
  });

  /** Reduced motion, no WebGL, data saver: all of them mean nobody is listening. */
  it('is harmless when nothing is listening', () => {
    expect(() => fireMeteor()).not.toThrow();
  });

  it('stops reaching a listener that unsubscribed', () => {
    const listener = vi.fn();
    onMeteor(listener)();

    fireMeteor();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reaches every listener, so two skies would both fire', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stops = [onMeteor(first), onMeteor(second)];

    fireMeteor();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    for (const stop of stops) stop();
  });
});
