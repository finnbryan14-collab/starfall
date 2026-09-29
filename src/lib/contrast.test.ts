import { describe, expect, it } from 'vitest';

import { AA_NON_TEXT, AA_TEXT, contrastHex, contrastRatio, parseHex } from '@/lib/contrast';
import { readTokens } from '@/lib/tokens.server';

describe('contrast maths', () => {
  it('matches the WCAG reference extremes', () => {
    expect(contrastHex('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastHex('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    const a = parseHex('#e7b75f')!;
    const b = parseHex('#141739')!;
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('parses both hex forms', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#141739')).toEqual({ r: 20, g: 23, b: 57 });
    expect(parseHex('rgb(231 183 95 / 0.16)')).toBeNull();
  });
});

/**
 * The floor DESIGN.md sets: 4.5:1 for text on --ink and --well.
 *
 * --faint failed this in the delivered package (3.70:1 on --ink) and the
 * preview used it at 11px, under DESIGN.md's own 12px carve-out. This test is
 * why that cannot come back quietly.
 */
describe('token contrast against DESIGN.md floors', () => {
  const surfaces = ['--ink', '--well'] as const;
  const textTokens = ['--starlight', '--dim', '--faint', '--maybe', '--feed'] as const;

  it('every text token clears 4.5:1 on every surface', async () => {
    const tokens = await readTokens();
    const value = (name: string) => {
      const token = tokens.find((t) => t.name === name);
      if (!token) throw new Error(`token ${name} not found in tokens.css`);
      return token.value;
    };

    const failures: string[] = [];
    for (const text of textTokens) {
      for (const surface of surfaces) {
        const ratio = contrastHex(value(text), value(surface));
        expect(ratio, `${text} on ${surface} is not plain hex`).not.toBeNull();
        if (ratio! < AA_TEXT) {
          failures.push(`${text} on ${surface}: ${ratio!.toFixed(2)}:1`);
        }
      }
    }

    expect(failures, `below the ${AA_TEXT}:1 floor`).toEqual([]);
  });

  it('rarity colours stay legible as text too', async () => {
    const tokens = await readTokens();
    const value = (name: string) => tokens.find((t) => t.name === name)!.value;

    for (const rarity of ['--gold', '--violet', '--blue'] as const) {
      for (const surface of surfaces) {
        expect(
          contrastHex(value(rarity), value(surface))!,
          `${rarity} on ${surface}`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it('the gold focus ring clears the 3:1 non-text floor', async () => {
    const tokens = await readTokens();
    const value = (name: string) => tokens.find((t) => t.name === name)!.value;
    for (const surface of surfaces) {
      expect(contrastHex(value('--gold'), value(surface))!).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('--faint specifically stays above the floor it used to fail', async () => {
    const tokens = await readTokens();
    const faint = tokens.find((t) => t.name === '--faint')!;
    const ink = tokens.find((t) => t.name === '--ink')!;
    const well = tokens.find((t) => t.name === '--well')!;
    // Old value #6c70a3 measured 3.70 / 3.27. See docs/DECISIONS.md.
    expect(contrastHex(faint.value, ink.value)!).toBeGreaterThan(5);
    expect(contrastHex(faint.value, well.value)!).toBeGreaterThan(AA_TEXT);
  });
});
