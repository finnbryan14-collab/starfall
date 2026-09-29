import { describe, expect, it } from 'vitest';

import { formatNumber, formatPercent, parseNumber } from '@/lib/format';

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(11200)).toBe('11,200');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('rounds before formatting', () => {
    expect(formatNumber(15259.7)).toBe('15,260');
  });
});

describe('formatPercent', () => {
  it('renders the hero numeral without its unit', () => {
    // The preview's headline figure for the sample plan.
    expect(formatPercent(0.72883)).toBe('72.9');
  });

  it('honours the requested precision', () => {
    expect(formatPercent(0.5, 0)).toBe('50');
  });
});

describe('parseNumber', () => {
  it('round-trips a formatted value', () => {
    expect(parseNumber(formatNumber(11200))).toBe(11200);
  });

  it('treats junk as zero rather than NaN', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber('abc')).toBe(0);
  });
});
