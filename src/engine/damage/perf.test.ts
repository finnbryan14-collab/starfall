import { describe, expect, it } from 'vitest';

import { SLOT_ORDER, type MainStatKey, type Slot, type Substats } from '@/engine/artifacts/model';
import type { EquippedArtifact, TalentHit } from '@/engine/damage/build';
import { searchBuilds, type SearchSet } from '@/engine/damage/search';
import { mulberry32, pick, randomInt, type Rng } from '@/engine/rng';

/**
 * The search has to finish on a real bag.
 *
 * Four hundred artifacts is a normal mid-game inventory and about eighty per
 * slot, which is 3.3 billion combinations — so this measures whether the bound
 * prunes hard enough to make the search usable rather than theoretical. The
 * budget is generous because the search runs in a worker and the player asked
 * for it, unlike the Plan screen's 50ms input-change budget. Measured across
 * three generated bags of that size: 68ms, 88ms and 1.2s, always exhaustive.
 *
 * Wall-clock assertions live under `pnpm perf`, which runs this file on its
 * own. Inside `pnpm test` they measure contention between worker threads
 * instead; see src/engine/wish/perf.test.ts for how that went. What stays in
 * the default suite is the claim that matters for correctness — that the search
 * completes exhaustively on a bag this size, rather than quietly falling back
 * to the node budget.
 */

const PERF = Boolean(process.env.PERF);

/** Median of several runs, so one unlucky GC pause is not the measurement. */
function medianMs(run: () => void, samples = 3): number {
  run();
  const times: number[] = [];
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(samples / 2)];
}

const SETS = [
  'CrimsonWitchOfFlames',
  'ShimenawasReminiscence',
  'GladiatorsFinale',
  'NoblesseOblige',
  'EmblemOfSeveredFate',
  'WanderersTroupe',
  'VermillionHereafter',
  'MarechausseeHunter',
];

const SEARCH_SETS: SearchSet[] = [
  { key: 'CrimsonWitchOfFlames', stats: { pyro_dmg: 0.15 }, hitBonus: 0 },
  { key: 'ShimenawasReminiscence', stats: { atk_: 0.18 }, hitBonus: 0 },
  { key: 'GladiatorsFinale', stats: { atk_: 0.18 }, hitBonus: 0 },
  { key: 'NoblesseOblige', stats: null, hitBonus: 0 },
  { key: 'EmblemOfSeveredFate', stats: { er: 0.2 }, hitBonus: 0 },
  { key: 'WanderersTroupe', stats: { em: 80 }, hitBonus: 0 },
  { key: 'VermillionHereafter', stats: { atk_: 0.18 }, hitBonus: 0 },
  { key: 'MarechausseeHunter', stats: null, hitBonus: 0 },
];

const MAINS: Record<Slot, MainStatKey[]> = {
  flower: ['hp'],
  plume: ['atk'],
  sands: ['atk_', 'hp_', 'def_', 'er', 'em'],
  goblet: ['pyro_dmg', 'cryo_dmg', 'atk_', 'hp_', 'em'],
  circlet: ['cr', 'cd', 'atk_', 'hp_', 'em'],
};

const MAIN_VALUES: Partial<Record<MainStatKey, number>> = {
  hp: 4780,
  atk: 311,
  atk_: 46.6,
  hp_: 46.6,
  def_: 58.3,
  er: 51.8,
  em: 187,
  pyro_dmg: 46.6,
  cryo_dmg: 46.6,
  cr: 31.1,
  cd: 62.2,
};

const SUBSTAT_KEYS = ['cr', 'cd', 'atk_', 'atk', 'em', 'er', 'hp_', 'hp', 'def_', 'def'] as const;

/** A bag the shape of a real one: every slot filled, mixed sets, mixed rolls. */
function bagOf(perSlot: number, rng: Rng): EquippedArtifact[] {
  const bag: EquippedArtifact[] = [];

  for (const slotKey of SLOT_ORDER) {
    for (let index = 0; index < perSlot; index++) {
      const mainStat = pick(rng, MAINS[slotKey]);
      const substats: Substats = {};
      for (let roll = 0; roll < 4; roll++) {
        const key = pick(rng, SUBSTAT_KEYS);
        substats[key] = (substats[key] ?? 0) + 3 + randomInt(rng, 20);
      }
      bag.push({
        slotKey,
        setKey: pick(rng, SETS),
        mainStat,
        mainValue: MAIN_VALUES[mainStat] ?? 0,
        substats,
      });
    }
  }

  return bag;
}

const HIT: TalentHit = {
  label: 'Skill DMG',
  parts: [{ join: '', stat: 'atk', values: [2.48] }],
};

const search = (artifacts: readonly EquippedArtifact[], top = 5) =>
  searchBuilds({
    artifacts,
    character: { hp: 15_552.31, atk: 106.43, def: 876.15, cr: 0.05, cd: 0.884, er: 1 },
    weapon: { atk: 608.07, cd: 0.662 },
    objective: {
      hit: HIT,
      category: 'skill',
      talentLevel: 1,
      element: 'pyro',
      enemy: { level: 90, resistance: 0.1 },
    },
    sets: SEARCH_SETS,
    top,
  });

describe('searching a real bag', () => {
  /**
   * Two bags of the same size and very different difficulty: the first visits
   * 1.8 million nodes, the second 17.6 million. Both are proven optimal, which
   * is the claim that has to hold whatever the bag looks like.
   */
  it.each([
    { seed: 2026, nodes: 4_000_000 },
    { seed: 99, nodes: 40_000_000 },
  ])('finishes exhaustively on four hundred artifacts (seed $seed)', ({ seed, nodes }) => {
    const result = search(bagOf(80, mulberry32(seed)));

    expect(result.exhaustive).toBe(true);
    expect(result.best).toHaveLength(5);
    expect(result.nodes).toBeLessThan(nodes);
    // 3.3 billion combinations exist. The bound is tight enough that only a
    // few thousand complete builds ever get scored.
    expect(result.evaluated).toBeLessThan(100_000);
  });

  /**
   * Twice a realistic bag, and the hardest case measured: 105 million nodes
   * against a 200 million budget. Under `pnpm perf` because it takes 7s, which
   * does not belong in a suite people run on every save.
   */
  it.runIf(PERF)(
    'finishes exhaustively on a bag twice that size',
    () => {
      const result = search(bagOf(160, mulberry32(7)));

      console.log(`800-artifact search: ${result.nodes.toLocaleString('en-US')} nodes`);
      expect(result.exhaustive).toBe(true);
      expect(result.best).toHaveLength(5);
      // Well past Vitest's 5s default, which is the point of the test.
    },
    60_000,
  );

  it.runIf(PERF)('searches four hundred artifacts in well under a second', () => {
    const bag = bagOf(80, mulberry32(2026));
    const elapsed = medianMs(() => search(bag));

    console.log(`400-artifact search: ${elapsed.toFixed(0)}ms`);
    // Measured at 68ms for the top five; the budget allows for a busy machine.
    expect(elapsed).toBeLessThan(1000);
  });

  it.runIf(PERF)('is not much slower asking for the top twenty', () => {
    const bag = bagOf(80, mulberry32(2026));
    const one = medianMs(() => search(bag, 1));
    const twenty = medianMs(() => search(bag, 20));

    console.log(`top 1: ${one.toFixed(0)}ms, top 20: ${twenty.toFixed(0)}ms`);
    // A deeper list raises the pruning threshold more slowly, so some cost is
    // expected — measured at 87ms against 204ms. An order of magnitude would
    // mean the bound had stopped working.
    expect(twenty).toBeLessThan(one * 10 + 200);
  });
});
