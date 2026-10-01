import { describe, expect, it } from 'vitest';

import { mulberry32, pick, randomInt } from '../rng';
import {
  SLOT_ORDER,
  type MainStatKey,
  type Slot,
  type SubstatKey,
  type Substats,
} from '../artifacts/model';
import { assembleBuild, hitDamage, type EquippedArtifact, type TalentHit } from './build';
import { searchBuilds, type SearchInput, type SearchSet } from './search';

/**
 * docs/MATH.md section 9.
 *
 * The search has one job and one obligation. The job is to find the five
 * artifacts that hit hardest. The obligation is that pruning never changes the
 * answer — which is what the brute-force comparison below is for, and why the
 * bag it compares on is generated from a seeded RNG rather than chosen by hand.
 */

/** As `characterBaseStats` returns her: crit and Energy Recharge include their base. */
const HU_TAO = { hp: 15_552.31, atk: 106.43, def: 876.15, cr: 0.05, cd: 0.884, er: 1 };
const HOMA = { atk: 608.07, cd: 0.662 };

const SKILL: TalentHit = {
  label: 'Skill DMG',
  parts: [{ join: '', stat: 'atk', values: [2] }],
};

const OBJECTIVE = {
  hit: SKILL,
  category: 'skill' as const,
  talentLevel: 1,
  element: 'pyro',
  enemy: { level: 90, resistance: 0.1 },
};

function input(
  artifacts: readonly EquippedArtifact[],
  overrides: Partial<SearchInput> = {},
): SearchInput {
  return {
    artifacts,
    character: HU_TAO,
    weapon: HOMA,
    objective: OBJECTIVE,
    ...overrides,
  };
}

function artifact(
  slotKey: Slot,
  mainStat: MainStatKey,
  mainValue: number,
  setKey = 'GladiatorsFinale',
  substats: Substats = {},
): EquippedArtifact {
  return { slotKey, setKey, mainStat, mainValue, substats };
}

/** One of everything, so a search has exactly one answer. */
function oneEach(setKey = 'GladiatorsFinale'): EquippedArtifact[] {
  return [
    artifact('flower', 'hp', 4780, setKey),
    artifact('plume', 'atk', 311, setKey),
    artifact('sands', 'atk_', 46.6, setKey),
    artifact('goblet', 'pyro_dmg', 46.6, setKey),
    artifact('circlet', 'cd', 62.2, setKey),
  ];
}

/** The damage a specific five would deal, computed the ordinary way. */
function damageOf(artifacts: readonly EquippedArtifact[], sets: readonly SearchSet[] = []): number {
  const counts: Record<string, number> = {};
  for (const piece of artifacts) counts[piece.setKey] = (counts[piece.setKey] ?? 0) + 1;

  const active = sets.filter((set) => (counts[set.key] ?? 0) >= 2);

  return hitDamage({
    ...OBJECTIVE,
    stats: assembleBuild({
      character: HU_TAO,
      weapon: HOMA,
      artifacts,
      setStats: active.map((set) => set.stats ?? {}),
    }),
    hitBonuses: active
      .filter((set) => set.hitBonus > 0)
      .map((set) => ({ categories: ['skill' as const], amount: set.hitBonus })),
  }).damage;
}

describe('searchBuilds', () => {
  it('finds the only build there is', () => {
    const bag = oneEach();
    const search = searchBuilds(input(bag));

    expect(search.best).toHaveLength(1);
    expect(search.best[0].damage).toBeCloseTo(damageOf(bag), 6);
    expect(search.exhaustive).toBe(true);
    expect(search.missing).toEqual([]);
  });

  /**
   * A build needs all five slots. Saying which one is empty is more useful than
   * an empty list, because the answer is "go farm a circlet".
   */
  it('says which slot it has nothing for', () => {
    const search = searchBuilds(input(oneEach().slice(0, 3)));

    expect(search.best).toEqual([]);
    expect(search.missing).toEqual(['goblet', 'circlet']);
  });

  it('picks the better of two in a slot', () => {
    const bag = [...oneEach(), artifact('sands', 'atk_', 20)];
    const search = searchBuilds(input(bag));

    expect(search.best[0].artifacts.find((piece) => piece.mainStat === 'atk_')?.mainValue).toBe(
      46.6,
    );
  });

  /**
   * The set bonus is why this cannot be five independent choices. Crimson Witch
   * gives 15% Pyro DMG at two pieces, which can be worth more than a better
   * individual artifact from another set.
   */
  it('takes a set bonus over two better individual pieces', () => {
    const sets: SearchSet[] = [
      { key: 'CrimsonWitchOfFlames', stats: { pyro_dmg: 0.15 }, hitBonus: 0 },
      { key: 'GladiatorsFinale', stats: { atk_: 0.18 }, hitBonus: 0 },
    ];

    const bag = [
      // A Crimson Witch pair, each piece slightly worse than its rival.
      artifact('flower', 'hp', 4000, 'CrimsonWitchOfFlames'),
      artifact('plume', 'atk', 290, 'CrimsonWitchOfFlames'),
      artifact('flower', 'hp', 4780, 'NoblesseOblige'),
      artifact('plume', 'atk', 311, 'NoblesseOblige'),
      artifact('sands', 'atk_', 46.6, 'NoblesseOblige'),
      artifact('goblet', 'pyro_dmg', 46.6, 'NoblesseOblige'),
      artifact('circlet', 'cd', 62.2, 'NoblesseOblige'),
    ];

    const search = searchBuilds(input(bag, { sets }));
    const chosen = search.best[0].artifacts.filter(
      (piece) => piece.setKey === 'CrimsonWitchOfFlames',
    );

    expect(chosen).toHaveLength(2);
    expect(search.best[0].damage).toBeCloseTo(damageOf(search.best[0].artifacts, sets), 6);
  });

  it('applies a set bonus that only some hits get', () => {
    const sets: SearchSet[] = [
      { key: 'NoblesseOblige', stats: null, hitBonus: 0.2 },
      { key: 'GladiatorsFinale', stats: { atk_: 0.18 }, hitBonus: 0 },
    ];

    const noblesse = searchBuilds(input(oneEach('NoblesseOblige'), { sets }));
    const gladiator = searchBuilds(input(oneEach('GladiatorsFinale'), { sets }));

    // +20% on the hit against +18% ATK on a build that is mostly base ATK.
    expect(noblesse.best[0].damage).toBeCloseTo(damageOf(oneEach('NoblesseOblige'), sets), 6);
    expect(gladiator.best[0].damage).toBeCloseTo(damageOf(oneEach('GladiatorsFinale'), sets), 6);
  });

  it('returns the top few, best first', () => {
    const bag = [
      ...oneEach(),
      artifact('circlet', 'cd', 40),
      artifact('circlet', 'cd', 20),
      artifact('circlet', 'cd', 10),
    ];
    const search = searchBuilds(input(bag, { top: 3 }));

    expect(search.best).toHaveLength(3);
    expect(search.best[0].damage).toBeGreaterThan(search.best[1].damage);
    expect(search.best[1].damage).toBeGreaterThan(search.best[2].damage);
    expect(search.best[0].artifacts.find((piece) => piece.mainStat === 'cd')?.mainValue).toBe(62.2);
  });

  /**
   * An Energy Recharge floor is the one constraint that actually changes an
   * answer, because a burst that does not come back does no damage at all.
   */
  it('respects an Energy Recharge floor', () => {
    const bag = [
      ...oneEach(),
      artifact('sands', 'er', 51.8),
      artifact('circlet', 'cd', 62.2, 'GladiatorsFinale', { er: 20 }),
    ];

    const free = searchBuilds(input(bag));
    // 100% base, 51.8% from the sands, 20% rolled on the circlet: 171.8%.
    const constrained = searchBuilds(input(bag, { constraints: { minEnergyRecharge: 1.7 } }));

    // Unconstrained, the ATK% sands wins and no Energy Recharge is taken.
    expect(free.best[0].artifacts.some((piece) => piece.mainStat === 'er')).toBe(false);

    // Constrained, it has to take the Energy Recharge sands.
    expect(constrained.best).toHaveLength(1);
    expect(constrained.best[0].artifacts.some((piece) => piece.mainStat === 'er')).toBe(true);
  });

  /**
   * The threshold is the figure on the character screen, which starts at 100%
   * before any artifact. 300% is not reachable from one sands and a substat.
   */
  it('comes back empty rather than wrong when no build can meet the floor', () => {
    const search = searchBuilds(input(oneEach(), { constraints: { minEnergyRecharge: 3 } }));

    expect(search.best).toEqual([]);
    expect(search.exhaustive).toBe(true);
  });

  /**
   * The obligation. Pruning is only allowed if it cannot change the answer, so
   * this generates a bag, searches it, and compares against every combination
   * one at a time.
   */
  it('agrees with brute force on a generated bag', () => {
    const rng = mulberry32(2026);
    const sets: SearchSet[] = [
      { key: 'CrimsonWitchOfFlames', stats: { pyro_dmg: 0.15 }, hitBonus: 0 },
      { key: 'GladiatorsFinale', stats: { atk_: 0.18 }, hitBonus: 0 },
      { key: 'NoblesseOblige', stats: null, hitBonus: 0.2 },
      { key: 'EmblemOfSeveredFate', stats: { er: 0.2 }, hitBonus: 0 },
    ];
    const setKeys = sets.map((set) => set.key);
    const mains: Record<Slot, MainStatKey[]> = {
      flower: ['hp'],
      plume: ['atk'],
      sands: ['atk_', 'hp_', 'er', 'em'],
      goblet: ['pyro_dmg', 'atk_', 'hp_'],
      circlet: ['cr', 'cd', 'atk_'],
    };
    const mainValues: Partial<Record<MainStatKey, number>> = {
      hp: 4780,
      atk: 311,
      atk_: 46.6,
      hp_: 46.6,
      er: 51.8,
      em: 187,
      pyro_dmg: 46.6,
      cr: 31.1,
      cd: 62.2,
    };
    const substatKeys: SubstatKey[] = ['cr', 'cd', 'atk_', 'atk', 'em', 'er', 'hp_'];

    const bag: EquippedArtifact[] = [];
    for (const slot of Object.keys(mains) as Slot[]) {
      for (let index = 0; index < 4; index++) {
        const mainStat = pick(rng, mains[slot]);
        const substats: Substats = {};
        for (let roll = 0; roll < 4; roll++) {
          const key = pick(rng, substatKeys);
          substats[key] = (substats[key] ?? 0) + 1 + randomInt(rng, 10);
        }
        bag.push(artifact(slot, mainStat, mainValues[mainStat] ?? 0, pick(rng, setKeys), substats));
      }
    }

    const search = searchBuilds(input(bag, { sets, top: 1 }));
    expect(search.exhaustive).toBe(true);

    // Every combination, one at a time.
    const bySlot = (slot: Slot) => bag.filter((piece) => piece.slotKey === slot);
    let best = Number.NEGATIVE_INFINITY;
    for (const flower of bySlot('flower')) {
      for (const plume of bySlot('plume')) {
        for (const sands of bySlot('sands')) {
          for (const goblet of bySlot('goblet')) {
            for (const circlet of bySlot('circlet')) {
              const damage = damageOf([flower, plume, sands, goblet, circlet], sets);
              if (damage > best) best = damage;
            }
          }
        }
      }
    }

    expect(search.best[0].damage).toBeCloseTo(best, 4);
    // And pruning actually happened, or this test proves nothing about it.
    expect(search.pruned).toBeGreaterThan(0);
  });

  /**
   * A bag nobody could search exhaustively should still give an answer and say
   * that it is the best found rather than the best there is.
   */
  it('stops at the node budget and says so', () => {
    /*
      Every piece trades one stat against another, so no piece dominates and
      the optimistic bound stays loose — which is what keeps the tree from
      collapsing. A bag that prunes well is the ordinary case; this is the one
      that does not.
    */
    const bag: EquippedArtifact[] = [];
    for (const slot of SLOT_ORDER) {
      for (let index = 1; index <= 6; index++) {
        bag.push(
          artifact(slot, 'atk_', index * 5, 'GladiatorsFinale', {
            cr: 35 - index * 5,
            cd: index * 5,
            atk: (7 - index) * 10,
          }),
        );
      }
    }

    const search = searchBuilds(input(bag, { maxNodes: 200 }));

    expect(search.exhaustive).toBe(false);
    expect(search.best).toHaveLength(1);
    expect(search.best[0].damage).toBeGreaterThan(0);
  });

  it('refuses a top count that makes no sense', () => {
    expect(() => searchBuilds(input(oneEach(), { top: 0 }))).toThrow(RangeError);
  });
});
