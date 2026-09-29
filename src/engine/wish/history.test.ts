import { describe, expect, it } from 'vitest';

import { EXPECTED_PULLS_PER_5STAR } from '@/engine/wish/pity';
import {
  BANNER_TYPES,
  isStandardCharacter,
  mergeWishes,
  sortChronologically,
  STANDARD_5STAR_CHARACTERS,
  summariseCharacterHistory,
  type Wish,
} from '@/engine/wish/history';

/** Builds a run of pulls, with 5-stars placed where asked. */
let nextId = 1000;
function pull(overrides: Partial<Wish> = {}): Wish {
  nextId++;
  return {
    id: String(nextId),
    gachaType: BANNER_TYPES.character,
    rankType: '3',
    itemType: 'Weapon',
    name: 'Cool Steel',
    time: '2026-09-01 12:00:00',
    ...overrides,
  };
}

const fiveStar = (name: string, overrides: Partial<Wish> = {}) =>
  pull({ rankType: '5', itemType: 'Character', name, ...overrides });

/** `n` filler pulls, to build up pity. */
const filler = (n: number, overrides: Partial<Wish> = {}) =>
  Array.from({ length: n }, () => pull(overrides));

describe('isStandardCharacter', () => {
  it('knows the standard pool', () => {
    expect(isStandardCharacter('Qiqi')).toBe(true);
    expect(isStandardCharacter('Dehya')).toBe(true);
    expect(isStandardCharacter('Yumemizuki Mizuki')).toBe(true);
  });

  it('treats anyone else as a featured character', () => {
    expect(isStandardCharacter('Skirk')).toBe(false);
    expect(isStandardCharacter('Escoffier')).toBe(false);
  });

  it('ignores case and stray whitespace', () => {
    expect(isStandardCharacter('  qiqi ')).toBe(true);
  });

  it('carries the pool the wiki lists', () => {
    expect(STANDARD_5STAR_CHARACTERS).toHaveLength(8);
    expect(STANDARD_5STAR_CHARACTERS).toContain('Tighnari');
  });
});

describe('summariseCharacterHistory', () => {
  it('counts pity since the last 5-star', () => {
    const wishes = [...filler(10), fiveStar('Skirk'), ...filler(22)];
    const summary = summariseCharacterHistory(wishes);
    expect(summary.pity).toBe(22);
  });

  it('starts from zero when the last pull was a 5-star', () => {
    const wishes = [...filler(10), fiveStar('Skirk')];
    expect(summariseCharacterHistory(wishes).pity).toBe(0);
  });

  it('guarantees the next 5-star after a standard character', () => {
    const wishes = [...filler(70), fiveStar('Qiqi'), ...filler(5)];
    const summary = summariseCharacterHistory(wishes);
    expect(summary.guaranteed).toBe(true);
    expect(summary.fiveStars[0].featured).toBe(false);
  });

  it('clears the guarantee once it is cashed in', () => {
    const wishes = [
      ...filler(70),
      fiveStar('Qiqi'), // lost
      ...filler(60),
      fiveStar('Skirk'), // guaranteed
      ...filler(3),
    ];
    const summary = summariseCharacterHistory(wishes);
    expect(summary.guaranteed).toBe(false);
    expect(summary.fiveStars[1].wasGuaranteed).toBe(true);
  });

  it('leaves the guarantee off after winning a 50/50', () => {
    const wishes = [...filler(70), fiveStar('Skirk'), ...filler(5)];
    expect(summariseCharacterHistory(wishes).guaranteed).toBe(false);
  });

  /**
   * The rule DATA.md calls out: a win straight after a loss was guaranteed,
   * not a coin flip. Counting it inflates every naive luck tracker.
   */
  it('keeps guaranteed pulls out of the 50/50 record', () => {
    const wishes = [
      ...filler(70),
      fiveStar('Qiqi'), // lost a real 50/50
      ...filler(70),
      fiveStar('Skirk'), // guaranteed, not a coin flip
      ...filler(70),
      fiveStar('Escoffier'), // won a real 50/50
    ];
    const summary = summariseCharacterHistory(wishes);

    expect(summary.fiftyFiftyLosses).toBe(1);
    expect(summary.fiftyFiftyWins).toBe(1);
    // Three 5-stars, but only two were coin flips.
    expect(summary.fiveStars).toHaveLength(3);
    expect(summary.fiftyFiftyWins + summary.fiftyFiftyLosses).toBe(2);
  });

  it('reads both character banners as one pity counter', () => {
    // 301 and 400 share pity, so a player who moved between them has one streak.
    const wishes = [
      ...filler(40, { gachaType: BANNER_TYPES.character }),
      ...filler(30, { gachaType: BANNER_TYPES.character2 }),
    ];
    expect(summariseCharacterHistory(wishes).pity).toBe(70);
  });

  it('ignores the standard, weapon and beginner banners entirely', () => {
    const wishes = [
      ...filler(10, { gachaType: BANNER_TYPES.character }),
      ...filler(50, { gachaType: BANNER_TYPES.standard }),
      ...filler(50, { gachaType: BANNER_TYPES.weapon }),
      ...filler(20, { gachaType: BANNER_TYPES.beginner }),
      // A 5-star on the standard banner must not touch character pity.
      fiveStar('Qiqi', { gachaType: BANNER_TYPES.standard }),
    ];
    const summary = summariseCharacterHistory(wishes);
    expect(summary.pity).toBe(10);
    expect(summary.guaranteed).toBe(false);
    expect(summary.fiveStars).toHaveLength(0);
    expect(summary.totalPulls).toBe(10);
  });

  it('records the pity each 5-star arrived at', () => {
    const wishes = [...filler(74), fiveStar('Skirk'), ...filler(9), fiveStar('Escoffier')];
    const summary = summariseCharacterHistory(wishes);
    expect(summary.fiveStars.map((event) => event.pity)).toEqual([75, 10]);
  });

  it('compares average pity against the model', () => {
    const wishes = [...filler(61), fiveStar('Skirk'), ...filler(61), fiveStar('Escoffier')];
    const summary = summariseCharacterHistory(wishes);
    expect(summary.averagePity).toBe(62);
    // Just under 1 means slightly luckier than the 62.30 the model expects.
    expect(summary.luckVersusExpected).toBeCloseTo(62 / EXPECTED_PULLS_PER_5STAR, 9);
    expect(summary.luckVersusExpected!).toBeLessThan(1);
  });

  it('reports nothing rather than zero when there is no history', () => {
    const summary = summariseCharacterHistory([]);
    expect(summary.pity).toBe(0);
    expect(summary.guaranteed).toBe(false);
    expect(summary.averagePity).toBeNull();
    expect(summary.luckVersusExpected).toBeNull();
  });

  it('handles a history that is nothing but 5-stars', () => {
    const summary = summariseCharacterHistory([fiveStar('Skirk'), fiveStar('Qiqi')]);
    expect(summary.fiveStars.map((e) => e.pity)).toEqual([1, 1]);
    expect(summary.guaranteed).toBe(true);
  });

  it('works from unsorted input, since imports arrive newest first', () => {
    const ordered = [...filler(5), fiveStar('Skirk'), ...filler(3)];
    const shuffled = [...ordered].reverse();
    expect(summariseCharacterHistory(shuffled)).toEqual(summariseCharacterHistory(ordered));
  });
});

describe('mergeWishes', () => {
  it('keeps one row per id, so a repeat import does not duplicate', () => {
    const first = [pull({ id: '1' }), pull({ id: '2' })];
    const again = [pull({ id: '2' }), pull({ id: '3' })];
    expect(mergeWishes(first, again).map((w) => w.id)).toEqual(['1', '2', '3']);
  });

  it('extends history rather than replacing it', () => {
    // The game only serves about six months, so old imports are the only copy.
    const old = [pull({ id: '100' })];
    const recent = [pull({ id: '900' })];
    expect(mergeWishes(old, recent)).toHaveLength(2);
  });

  it('returns chronological order', () => {
    const merged = mergeWishes([pull({ id: '30' })], [pull({ id: '10' }), pull({ id: '20' })]);
    expect(merged.map((w) => w.id)).toEqual(['10', '20', '30']);
  });

  it('is stable when nothing new arrives', () => {
    const existing = [pull({ id: '1' }), pull({ id: '2' })];
    expect(mergeWishes(existing, [])).toHaveLength(2);
  });
});

describe('sortChronologically', () => {
  it('orders by id rather than by the timezone-less time string', () => {
    const wishes = [
      pull({ id: '300', time: '2026-01-01 00:00:00' }),
      pull({ id: '100', time: '2026-12-31 00:00:00' }),
    ];
    expect(sortChronologically(wishes).map((w) => w.id)).toEqual(['100', '300']);
  });

  it('does not mutate its input', () => {
    const wishes = [pull({ id: '2' }), pull({ id: '1' })];
    const before = wishes.map((w) => w.id);
    sortChronologically(wishes);
    expect(wishes.map((w) => w.id)).toEqual(before);
  });
});
