import { afterEach, describe, expect, it, vi } from 'vitest';

import { DURATION_FALLBACK_MS, duration, parseCssDuration } from '@/motion/durations';
import { onReducedMotionChange, prefersReducedMotion } from '@/motion/reduced-motion';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--d-signature');
});

describe('parseCssDuration', () => {
  it('reads both CSS time units', () => {
    expect(parseCssDuration('160ms')).toBe(160);
    expect(parseCssDuration('0.42s')).toBe(420);
    expect(parseCssDuration('1100ms')).toBe(1100);
  });

  it('reads the zero the reduced-motion media query writes', () => {
    expect(parseCssDuration('0ms')).toBe(0);
    expect(parseCssDuration('0s')).toBe(0);
  });

  it('tolerates the whitespace getPropertyValue returns', () => {
    expect(parseCssDuration('  420ms  ')).toBe(420);
  });

  it('reads the forms Lightning CSS minifies tokens into', () => {
    // Tailwind minifies the stylesheet, so the authored units do not survive:
    // 160ms ships as .16s, 420ms as .42s, 1100ms as 1.1s and 0ms as 0s.
    expect(parseCssDuration('.16s')).toBe(160);
    expect(parseCssDuration('.42s')).toBeCloseTo(420, 10);
    expect(parseCssDuration('1.1s')).toBeCloseTo(1100, 10);
    expect(parseCssDuration('0s')).toBe(0);
  });

  it('returns null rather than NaN for junk', () => {
    expect(parseCssDuration('')).toBeNull();
    expect(parseCssDuration('fast')).toBeNull();
    expect(parseCssDuration('12px')).toBeNull();
  });
});

describe('duration', () => {
  it('reads the live token value', () => {
    document.documentElement.style.setProperty('--d-signature', '1100ms');
    expect(duration('signature')).toBe(1100);
  });

  it('sees zero when reduced motion has zeroed the token', () => {
    // This is the whole point: the CSS media query in tokens.css zeroes the
    // token, and JS reads the same value rather than a hardcoded number.
    document.documentElement.style.setProperty('--d-signature', '0ms');
    expect(duration('signature')).toBe(0);
  });

  it('falls back to the tokens.css value when the property is absent', () => {
    expect(duration('move')).toBe(DURATION_FALLBACK_MS.move);
  });
});

describe('prefersReducedMotion', () => {
  const stubMatchMedia = (matches: boolean, listeners: Set<(e: MediaQueryListEvent) => void>) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
        removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) =>
          listeners.delete(l),
      })),
    );
  };

  it('reports the current preference', () => {
    stubMatchMedia(true, new Set());
    expect(prefersReducedMotion()).toBe(true);

    stubMatchMedia(false, new Set());
    expect(prefersReducedMotion()).toBe(false);
  });

  it('notices a change made mid-session', () => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    stubMatchMedia(false, listeners);

    const seen: boolean[] = [];
    const unsubscribe = onReducedMotionChange((reduced) => seen.push(reduced));

    expect(listeners.size).toBe(1);
    listeners.forEach((l) => l({ matches: true } as MediaQueryListEvent));
    expect(seen).toEqual([true]);

    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it('does not throw where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
    expect(() => onReducedMotionChange(() => {})()).not.toThrow();
  });
});
