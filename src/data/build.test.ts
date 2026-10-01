import { describe, expect, it } from 'vitest';

import {
  assembleBuild,
  hitDamage,
  type EquippedArtifact,
  type TalentHit,
} from '@/engine/damage/build';
import { characterBaseStats, weaponBaseStats } from '@/engine/stats/scaling';

import { ARTIFACT_SETS } from './artifact-sets-generated';
import { activeSets, equip, equipAll, resolveSetBonuses, searchSets } from './build';
import { CHARACTERS, characterScaling } from './characters-generated';
import { WEAPONS, weaponScaling } from './weapons-generated';

/** Five pieces of one set, which is how a real build usually looks. */
function pieces(setKey: string, count: number): EquippedArtifact[] {
  return Array.from({ length: count }, (_, index) => ({
    slotKey: (['flower', 'plume', 'sands', 'goblet', 'circlet'] as const)[index % 5],
    setKey,
    mainStat: 'atk_' as const,
    mainValue: 0,
    substats: {},
  }));
}

describe('activeSets', () => {
  it('counts the pieces of each set', () => {
    expect(
      activeSets([...pieces('CrimsonWitchOfFlames', 4), ...pieces('NoblesseOblige', 1)]),
    ).toEqual({ CrimsonWitchOfFlames: 4, NoblesseOblige: 1 });
  });

  it('is empty for a build with nothing equipped', () => {
    expect(activeSets([])).toEqual({});
  });
});

describe('resolveSetBonuses', () => {
  it('ignores a single piece', () => {
    const resolved = resolveSetBonuses({ CrimsonWitchOfFlames: 1 });
    expect(resolved).toEqual({ stats: [], hitBonuses: [], unmodelled: [] });
  });

  it('applies a two-piece stat bonus', () => {
    expect(resolveSetBonuses({ CrimsonWitchOfFlames: 2 }).stats).toEqual([{ pyro_dmg: 0.15 }]);
  });

  /** Two two-piece sets is a real and common choice. */
  it('applies both halves of a split build', () => {
    const resolved = resolveSetBonuses({ CrimsonWitchOfFlames: 2, GladiatorsFinale: 2 });

    expect(resolved.stats).toHaveLength(2);
    expect(resolved.stats).toContainEqual({ pyro_dmg: 0.15 });
    expect(resolved.stats).toContainEqual({ atk_: 0.18 });
  });

  /**
   * Noblesse Oblige's two-piece is Burst DMG, not damage, so it lands on the
   * hit-bonus side where only a burst can pick it up.
   */
  it('keeps a hit-specific bonus separate from the stats', () => {
    const resolved = resolveSetBonuses({ NoblesseOblige: 2 });

    expect(resolved.stats).toEqual([]);
    expect(resolved.hitBonuses).toEqual([{ categories: ['burst'], amount: 0.2 }]);
  });

  /** A four-piece still gives its two-piece, which is worth 15% here. */
  it('gives a four-piece set its two-piece bonus as well', () => {
    const resolved = resolveSetBonuses({ CrimsonWitchOfFlames: 4 });

    expect(resolved.stats).toEqual([{ pyro_dmg: 0.15 }]);
    expect(resolved.unmodelled).toHaveLength(1);
    expect(resolved.unmodelled[0]).toMatchObject({ pieces: 4, reason: 'conditional' });
    expect(resolved.unmodelled[0].text).toContain('Vaporize and Melt');
  });

  /**
   * The boundary, stated out loud. A four-piece is never applied silently —
   * it comes back with the game's own wording so a screen can ask.
   */
  it('never applies a four-piece bonus on its own', () => {
    for (const [setKey, set] of Object.entries(ARTIFACT_SETS)) {
      if (!set.text.fourPiece) continue;
      const resolved = resolveSetBonuses({ [setKey]: 4 });
      expect(
        resolved.unmodelled.some((bonus) => bonus.pieces === 4),
        setKey,
      ).toBe(true);
    }
  });

  it('says when a two-piece cannot change a damage number', () => {
    // Thundersoother's two-piece is Electro RES.
    const resolved = resolveSetBonuses({ Thundersoother: 2 });

    expect(resolved.stats).toEqual([]);
    expect(resolved.unmodelled[0]).toMatchObject({ pieces: 2, reason: 'defensive' });
  });

  it('says when a two-piece needs the player to answer something', () => {
    // Obsidian Codex wants the character to be in Nightsoul's Blessing.
    const resolved = resolveSetBonuses({ ObsidianCodex: 2 });

    expect(resolved.unmodelled[0]).toMatchObject({ pieces: 2, reason: 'conditional' });
  });

  /**
   * A scanner export can name a set from a patch newer than our last
   * `pnpm build:data`. Saying so beats applying nothing and looking correct.
   */
  it('reports a set it has never heard of', () => {
    const resolved = resolveSetBonuses({ SomeSetFromNextPatch: 4 });

    expect(resolved.unmodelled).toEqual([
      {
        setKey: 'SomeSetFromNextPatch',
        name: 'SomeSetFromNextPatch',
        pieces: 4,
        reason: 'unknown',
        text: null,
      },
    ]);
  });

  it('has nothing to raise for a set that is fully modelled', () => {
    expect(resolveSetBonuses({ CrimsonWitchOfFlames: 2 }).unmodelled).toEqual([]);
  });
});

describe('equip', () => {
  /**
   * The value a GOOD export does not carry. 5-star CRIT DMG at +20 is 62.2% and
   * at +0 is 9.3%, which the wiki prints as its range.
   */
  it('derives the main stat value from rarity and level', () => {
    const base = {
      id: 'good-0',
      setKey: 'CrimsonWitchOfFlames',
      slotKey: 'circlet' as const,
      location: '',
      mainStat: 'cd' as const,
      substats: {},
      lock: false,
    };

    expect(equip({ ...base, rarity: 5, level: 20 })?.mainValue).toBeCloseTo(62.2, 3);
    expect(equip({ ...base, rarity: 5, level: 0 })?.mainValue).toBeCloseTo(9.3, 3);
    // A 4-star circlet maxes at +16 and a lower figure.
    expect(equip({ ...base, rarity: 4, level: 16 })?.mainValue).toBeLessThan(62.2);
  });

  it('clamps a level the rarity cannot reach rather than dropping the piece', () => {
    const piece = equip({
      id: 'good-1',
      setKey: 'CrimsonWitchOfFlames',
      slotKey: 'circlet',
      location: '',
      rarity: 4,
      // A scanner misreading +16 as +20 should not lose the artifact.
      level: 20,
      mainStat: 'cd',
      substats: {},
      lock: false,
    });

    expect(piece?.mainValue).toBeGreaterThan(0);
  });

  /**
   * Flat DEF is a substat and never a main stat, so there is no value to
   * derive. Inventing one would hand the optimiser a piece that cannot exist.
   */
  it('leaves out a piece whose main stat is not a main stat', () => {
    const impossible = {
      id: 'good-2',
      setKey: 'Adventurer',
      slotKey: 'sands' as const,
      location: '',
      rarity: 5,
      level: 20,
      mainStat: 'def' as const,
      substats: {},
      lock: false,
    };

    expect(equip(impossible)).toBeNull();
    expect(equipAll([impossible])).toEqual([]);
  });

  it('carries the substats through untouched, in the units they arrived in', () => {
    const piece = equip({
      id: 'good-3',
      setKey: 'CrimsonWitchOfFlames',
      slotKey: 'flower',
      location: '',
      rarity: 5,
      level: 20,
      mainStat: 'hp',
      substats: { cr: 7.8, cd: 21.8 },
      lock: false,
    });

    expect(piece?.substats).toEqual({ cr: 7.8, cd: 21.8 });
    expect(piece?.mainValue).toBe(4780);
  });
});

describe('searchSets', () => {
  it('reduces a hit bonus to the amount this hit actually gets', () => {
    const forBurst = searchSets('burst');
    const forSkill = searchSets('skill');
    const noblesse = (sets: ReturnType<typeof searchSets>) =>
      sets.find((set) => set.key === 'NoblesseOblige');

    expect(noblesse(forBurst)?.hitBonus).toBeCloseTo(0.2, 6);
    expect(noblesse(forSkill)?.hitBonus).toBe(0);
  });

  it('describes every set, so the search never meets an unknown one', () => {
    expect(searchSets('skill')).toHaveLength(Object.keys(ARTIFACT_SETS).length);
  });
});

describe('a whole build, end to end', () => {
  /**
   * Hu Tao at 90 with Staff of Homa at 90 and four Crimson Witch pieces, all
   * from the committed data rather than fixtures. The point is not the exact
   * figure — the formula's own tests cover that — but that every layer joins
   * up: base stats, growth curves, artifact units, set bonuses, the talent
   * multiplier and the damage formula.
   */
  it('turns real data into a damage figure', () => {
    const character = characterBaseStats(characterScaling(CHARACTERS.HuTao), 90, 6);
    const weapon = weaponBaseStats(weaponScaling(WEAPONS.StaffOfHoma), 90, 6);

    const artifacts: EquippedArtifact[] = [
      {
        slotKey: 'flower',
        setKey: 'CrimsonWitchOfFlames',
        mainStat: 'hp',
        mainValue: 4780,
        substats: { cr: 7.8 },
      },
      {
        slotKey: 'plume',
        setKey: 'CrimsonWitchOfFlames',
        mainStat: 'atk',
        mainValue: 311,
        substats: { cd: 21.8 },
      },
      {
        slotKey: 'sands',
        setKey: 'CrimsonWitchOfFlames',
        mainStat: 'hp_',
        mainValue: 46.6,
        substats: { cr: 7.8 },
      },
      {
        slotKey: 'goblet',
        setKey: 'CrimsonWitchOfFlames',
        mainStat: 'pyro_dmg',
        mainValue: 46.6,
        substats: { cd: 14.6 },
      },
      {
        slotKey: 'circlet',
        setKey: 'ShimenawasReminiscence',
        mainStat: 'cd',
        mainValue: 62.2,
        substats: { cr: 3.9 },
      },
    ];

    const sets = resolveSetBonuses(activeSets(artifacts));
    const stats = assembleBuild({
      character: character.stats,
      weapon: weapon.stats,
      artifacts,
      setStats: sets.stats,
      level: 90,
    });

    // Base ATK is hers plus the weapon's, and nothing else.
    expect(stats.base.atk).toBeCloseTo(106.43 + 608.07, 1);
    // 88.4% from her ascension, 66.2% from Homa, 62.2% + 21.8% + 14.6% worn.
    expect(stats.bonus.cd).toBeCloseTo(0.884 + 0.662 + 0.622 + 0.218 + 0.146, 3);
    // 5% base, plus three CRIT Rate rolls.
    expect(stats.bonus.cr).toBeCloseTo(0.05 + 0.078 + 0.078 + 0.039, 3);
    // 46.6% from the goblet and 15% from Crimson Witch's two-piece.
    expect(stats.bonus.pyro_dmg).toBeCloseTo(0.466 + 0.15, 3);

    // Crimson Witch 4-piece is active and is an input, not an assumption.
    expect(sets.unmodelled.map((bonus) => bonus.pieces)).toEqual([4]);

    const skill: TalentHit = {
      label: 'Blood Blossom DMG',
      parts: [
        {
          join: '',
          stat: 'atk',
          values: [
            0.64, 0.688, 0.736, 0.8, 0.848, 0.896, 0.96, 1.024, 1.088, 1.152, 1.216, 1.28, 1.36,
            1.44, 1.52,
          ],
        },
      ],
    };

    const result = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 9,
      stats,
      element: 'pyro',
      enemy: { level: 90, resistance: 0.1 },
    });

    expect(result.damage).toBeGreaterThan(0);
    // Every term multiplies out to the whole, so nothing was applied twice.
    const { base, damageBonus, def, res, crit, amplifying } = result.parts;
    expect(base * damageBonus * def * res * crit * amplifying).toBeCloseTo(result.damage, 6);
  });
});
