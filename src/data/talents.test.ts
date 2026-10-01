import { afterEach, describe, expect, it, vi } from 'vitest';

import { hitCategoryOf, loadTalents, talentOptions, type Talents } from './talents';

/**
 * The talent files are ours but fetched at runtime, so what matters here is
 * what happens when one arrives wrong — and how a slash-joined label becomes
 * two options a player can actually choose between.
 */

const PLUNGE = {
  label: 'Low/High Plunge DMG',
  parts: [
    { join: '' as const, stat: 'atk' as const, values: [2] },
    { join: '/' as const, stat: 'atk' as const, values: [4] },
  ],
};

const TALENTS: Talents = {
  normal: {
    name: 'Secret Spear of Wangsheng',
    hits: [
      { label: '1-Hit DMG', parts: [{ join: '', stat: 'atk', values: [1] }] },
      { label: 'Charged Attack', parts: [{ join: '', stat: 'atk', values: [1] }] },
      PLUNGE,
    ],
  },
  skill: {
    name: 'Guide to Afterlife',
    hits: [{ label: 'Blood Blossom DMG', parts: [{ join: '', stat: 'atk', values: [1] }] }],
  },
};

describe('hitCategoryOf', () => {
  it('is the group for a skill or a burst', () => {
    expect(hitCategoryOf('skill', 'Skill DMG')).toBe('skill');
    expect(hitCategoryOf('burst', 'Burst DMG')).toBe('burst');
  });

  it('reads the three kinds of normal attack off the label', () => {
    expect(hitCategoryOf('normal', '1-Hit DMG')).toBe('normal');
    expect(hitCategoryOf('normal', 'Charged Attack')).toBe('charged');
    expect(hitCategoryOf('normal', 'Low/High Plunge DMG')).toBe('plunge');
  });

  /**
   * A bow character's charged attack is the aimed shot, so Marechaussee
   * Hunter's Normal-and-Charged bonus reaches it.
   */
  it('counts an aimed shot as a charged attack', () => {
    expect(hitCategoryOf('normal', 'Aimed Shot')).toBe('charged');
    expect(hitCategoryOf('normal', 'Fully-Charged Aimed Shot')).toBe('charged');
  });
});

describe('talentOptions', () => {
  it('flattens every group into one list', () => {
    const options = talentOptions(TALENTS);
    expect(options.map((option) => option.label)).toEqual([
      '1-Hit DMG',
      'Charged Attack',
      'Low Plunge DMG',
      'High Plunge DMG',
      'Blood Blossom DMG',
    ]);
  });

  /** The game names its own alternatives; borrowing the shared tail reads better. */
  it('splits a slash label into two choosable options', () => {
    const plunges = talentOptions(TALENTS).filter((option) => option.category === 'plunge');

    expect(plunges).toHaveLength(2);
    expect(plunges[0]).toMatchObject({ variant: 0, label: 'Low Plunge DMG' });
    expect(plunges[1]).toMatchObject({ variant: 1, label: 'High Plunge DMG' });
  });

  it('numbers the alternatives when the label does not name them', () => {
    const options = talentOptions({
      skill: { name: 'Whatever', hits: [{ ...PLUNGE, label: 'Skill DMG' }] },
    });

    expect(options.map((option) => option.label)).toEqual(['Skill DMG (1)', 'Skill DMG (2)']);
  });

  it('carries the talent name, so a picker can group by it', () => {
    expect(talentOptions(TALENTS)[0].talentName).toBe('Secret Spear of Wangsheng');
  });
});

describe('loadTalents', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a file and keeps only the groups it has', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          key: 'Qiqi',
          talents: {
            skill: {
              name: 'Adeptus Art: Herald of Frost',
              hits: [{ label: 'Skill DMG', parts: [{ join: '', stat: 'atk', values: [1.5] }] }],
            },
          },
        }),
      ),
    );

    const talents = await loadTalents('Qiqi');

    expect(talents?.skill?.name).toBe('Adeptus Art: Herald of Frost');
    expect(talents?.normal).toBeUndefined();
  });

  /**
   * Manekin and Manekina carry no damage talents in the game data, so the file
   * is absent by design. Null tells a screen "nothing to optimise" rather than
   * "something broke".
   */
  it('is null for a character with no talent file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(loadTalents('Manekin')).resolves.toBeNull();
  });

  /**
   * The failure that matters. A stale service-worker entry or a deploy caught
   * mid-flight would otherwise reach the damage formula as NaN and come back
   * out looking like an answer.
   */
  it('refuses a file whose multipliers are not numbers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          key: 'Diluc',
          talents: {
            skill: {
              name: 'Searing Onslaught',
              hits: [{ label: 'Skill DMG', parts: [{ join: '', stat: 'atk', values: ['lots'] }] }],
            },
          },
        }),
      ),
    );

    await expect(loadTalents('Diluc')).rejects.toThrow(/damaged/);
  });

  it('refuses a stat it does not know how to scale off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          key: 'Klee',
          talents: {
            skill: {
              name: 'Jumpy Dumpty',
              hits: [{ label: 'Skill DMG', parts: [{ join: '', stat: 'luck', values: [1] }] }],
            },
          },
        }),
      ),
    );

    await expect(loadTalents('Klee')).rejects.toThrow(/damaged/);
  });

  it('says so when the data cannot be reached at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );

    await expect(loadTalents('Xiao')).rejects.toThrow(/connection/);
  });

  it('fetches each character only once', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        key: 'Ganyu',
        talents: {
          skill: {
            name: 'Trail of the Qilin',
            hits: [{ label: 'Skill DMG', parts: [{ join: '', stat: 'atk', values: [1.32] }] }],
          },
        },
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    await loadTalents('Ganyu');
    await loadTalents('Ganyu');

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
