import { SLOT_ORDER, type MainStatKey, type Slot } from '../artifacts/model';
import { fromArtifactValue, type StatMap } from '../stats/scaling';
import {
  amplifyingMultiplier,
  critMultiplier,
  defMultiplier,
  resistanceMultiplier,
  type CritMode,
  type Reaction,
} from './formula';
import type { EquippedArtifact, HitCategory, TalentHit } from './build';

/**
 * Which five artifacts hit hardest.
 *
 * Branch and bound over the bag. The bound is sound because outgoing damage is
 * monotonically non-decreasing in every stat an artifact can carry — asserted
 * in formula.test.ts, and the reason this is a search rather than a heuristic.
 * So for any partial choice, adding the best each remaining slot could offer,
 * one stat at a time and ignoring whether one piece could really provide all of
 * them, gives a number no real completion can beat. If that optimistic number
 * loses to what has already been found, the whole branch can go.
 *
 * search.test.ts compares the result against every combination one at a time on
 * a generated bag. That test is the point: pruning is only allowed if it cannot
 * change the answer.
 *
 * ## Why this is not five independent choices
 *
 * Set bonuses. Two Crimson Witch pieces are worth 15% Pyro DMG, which can beat
 * two individually better pieces from different sets. That coupling is what
 * makes the problem a search at all.
 *
 * ## Why it runs on typed arrays
 *
 * A bag of four hundred is about eighty per slot, and five slots of eighty is
 * 3.3 billion combinations. Pruning removes the overwhelming majority, but the
 * inner loop still runs tens of millions of times, and an object allocation per
 * node would dominate everything else. So a candidate is a Float64Array of
 * eleven numbers and the accumulator is reused down the stack.
 *
 *   see also docs/MATH.md section 9
 *
 * Pure, like everything in src/engine: set bonuses arrive resolved.
 */

/** The stats an artifact can carry that change a damage number. */
const STATS = ['hp', 'hp_', 'atk', 'atk_', 'def', 'def_', 'cr', 'cd', 'em', 'er', 'dmg'] as const;
const WIDTH = STATS.length;

const HP = 0;
const HP_ = 1;
const ATK = 2;
const ATK_ = 3;
const DEF = 4;
const DEF_ = 5;
const CR = 6;
const CD = 7;
const EM = 8;
const ER = 9;
const DMG = 10;

const INDEX: Partial<Record<MainStatKey, number>> = {
  hp: HP,
  hp_: HP_,
  atk: ATK,
  atk_: ATK_,
  def: DEF,
  def_: DEF_,
  cr: CR,
  cd: CD,
  em: EM,
  er: ER,
};

/**
 * A set's 2-piece bonus, already looked up.
 *
 * `hitBonus` is only the part that applies to the hit being optimised, so
 * Noblesse Oblige arrives as 0.2 for a burst and 0 for everything else. The
 * caller resolves that, because the engine knows no sets — src/data/build.ts.
 */
export type SearchSet = {
  key: string;
  /** Flat stat bonus in engine units, or null when the 2-piece is not one. */
  stats: StatMap | null;
  /** The 2-piece DMG bonus, if it applies to this hit. */
  hitBonus: number;
};

export type SearchObjective = {
  hit: TalentHit;
  category: HitCategory;
  talentLevel: number;
  /** The element the hit deals, or null for a physical one. */
  element: string | null;
  enemy: { level: number; resistance: number; defReduction?: number; defIgnored?: number };
  reaction?: Reaction;
  critMode?: CritMode;
  variant?: number;
};

export type SearchInput = {
  artifacts: readonly EquippedArtifact[];
  /** The character's own stats, from `characterBaseStats`. */
  character: StatMap;
  weapon?: StatMap;
  /** Team effects the player has stated, in engine units. */
  buffs?: StatMap;
  level?: number;
  objective: SearchObjective;
  sets?: readonly SearchSet[];
  constraints?: {
    /** As a fraction: 1.8 means 180%, which is what a burst-reliant build needs. */
    minEnergyRecharge?: number;
  };
  /** How many builds to return. */
  top?: number;
  /**
   * The safety valve. An unfiltered bag can present more combinations than
   * anyone can visit, so the search stops here and says it was not exhaustive
   * rather than running until the tab dies.
   */
  maxNodes?: number;
};

export type SearchResult = { artifacts: EquippedArtifact[]; damage: number };

export type Search = {
  /** Best first. Empty when no build is possible. */
  best: SearchResult[];
  /** Complete builds actually scored. */
  evaluated: number;
  /** Branches the bound cut. */
  pruned: number;
  /** Candidates visited, which is what the node budget counts. */
  nodes: number;
  /** False when the node budget ran out, which makes `best` the best *found*. */
  exhaustive: boolean;
  /** Slots the bag has nothing for. A build needs all five. */
  missing: Slot[];
};

/**
 * Measured, not guessed.
 *
 * A 400-artifact bag is eighty per slot and 3.3 billion combinations. Across
 * three generated bags of that size the search finished exhaustively in 68ms,
 * 88ms and 1.2s, visiting 1.1 to 17.6 million nodes and scoring only a few
 * thousand complete builds. Doubling the bag to 800 took 3.0s and 7.5s, at 43
 * and 105 million nodes.
 *
 * So the budget is roughly ten times the hardest realistic bag. Past it the
 * search stops and reports `exhaustive: false`, which makes the answer the best
 * *found* rather than the best there is — worth saying rather than running
 * until the tab dies. The figures are in src/engine/damage/perf.test.ts.
 */
const DEFAULT_MAX_NODES = 200_000_000;

/** An artifact as eleven numbers, in engine units, with the element collapsed. */
function vectorOf(artifact: EquippedArtifact, elementKey: MainStatKey): Float64Array {
  const vector = new Float64Array(WIDTH);

  const add = (key: MainStatKey, value: number): void => {
    const slot = key === elementKey ? DMG : INDEX[key];
    // Anything else — a healing bonus, another element's goblet — cannot
    // change this hit and is simply not carried.
    if (slot !== undefined) vector[slot] += fromArtifactValue(key, value);
  };

  add(artifact.mainStat, artifact.mainValue);
  for (const [key, value] of Object.entries(artifact.substats) as [MainStatKey, number][]) {
    add(key, value);
  }

  return vector;
}

/** The same, for a stat map that is already in engine units. */
function vectorOfStats(stats: StatMap, elementKey: MainStatKey): Float64Array {
  const vector = new Float64Array(WIDTH);
  for (const [key, value] of Object.entries(stats) as [MainStatKey, number][]) {
    const slot = key === elementKey ? DMG : INDEX[key];
    if (slot !== undefined) vector[slot] += value;
  }
  return vector;
}

export function searchBuilds(input: SearchInput): Search {
  const {
    artifacts,
    character,
    weapon = {},
    buffs = {},
    level = 90,
    objective,
    sets = [],
    constraints = {},
    top = 1,
    maxNodes = DEFAULT_MAX_NODES,
  } = input;

  if (!Number.isInteger(top) || top < 1) {
    throw new RangeError(`top must be a positive integer, got ${top}`);
  }

  const elementKey = (
    objective.element ? `${objective.element}_dmg` : 'physical_dmg'
  ) as MainStatKey;

  // --- what does not change during the search ----------------------------

  const characterVector = vectorOfStats(character, elementKey);
  const weaponVector = vectorOfStats(weapon, elementKey);
  const buffVector = vectorOfStats(buffs, elementKey);

  /*
    Base HP, ATK and DEF are what the percentages multiply, and only the
    character and the weapon contribute to them — no weapon in the game has
    base HP or base DEF, so only ATK takes both.

    A buff's flat ATK is emphatically not base. Bennett's burst gives a flat
    figure, and folding it into base would let every ATK% on the build multiply
    it. Same reasoning as `assembleBuild`, which keeps the two sides apart in
    the type; here they are kept apart by index.
  */
  const baseHp = characterVector[HP];
  const baseAtk = characterVector[ATK] + weaponVector[ATK];
  const baseDef = characterVector[DEF];

  const fixed = new Float64Array(WIDTH);
  for (let index = 0; index < WIDTH; index++) {
    fixed[index] = characterVector[index] + weaponVector[index] + buffVector[index];
  }
  fixed[HP] = buffVector[HP];
  fixed[ATK] = buffVector[ATK];
  fixed[DEF] = buffVector[DEF];

  const { enemy } = objective;
  const constant =
    defMultiplier({
      characterLevel: level,
      enemyLevel: enemy.level,
      defReduction: enemy.defReduction,
      defIgnored: enemy.defIgnored,
    }) * resistanceMultiplier(enemy.resistance);

  // The talent's terms, flattened to (multiplier, which stat) pairs.
  const groups: { multiplier: number; stat: 'atk' | 'hp' | 'def' | 'em' }[][] = [];
  for (const part of objective.hit.parts) {
    if (
      !Number.isInteger(objective.talentLevel) ||
      objective.talentLevel < 1 ||
      objective.talentLevel > part.values.length
    ) {
      throw new RangeError(
        `talent level must be an integer in 1..${part.values.length}, got ${objective.talentLevel}`,
      );
    }
    const term = { multiplier: part.values[objective.talentLevel - 1], stat: part.stat };
    if (groups.length === 0 || part.join === '/') groups.push([term]);
    else groups[groups.length - 1].push(term);
  }

  const terms = groups[objective.variant ?? 0];
  if (!terms) {
    throw new RangeError(
      `${objective.hit.label} has ${groups.length} alternative(s), asked for number ${(objective.variant ?? 0) + 1}`,
    );
  }

  const reaction = objective.reaction;
  const critMode = objective.critMode ?? 'average';

  const setVectors = sets.map((set) => ({
    key: set.key,
    vector: set.stats ? vectorOfStats(set.stats, elementKey) : new Float64Array(WIDTH),
    hitBonus: set.hitBonus,
  }));
  const setIndexOf = new Map(setVectors.map((set, index) => [set.key, index]));

  /** The most any one set could add, for the optimistic bound. */
  const setBest = new Float64Array(WIDTH);
  let setBestHit = 0;
  for (const set of setVectors) {
    for (let index = 0; index < WIDTH; index++) {
      if (set.vector[index] > setBest[index]) setBest[index] = set.vector[index];
    }
    if (set.hitBonus > setBestHit) setBestHit = set.hitBonus;
  }

  /** Damage from an accumulated vector. The inner loop. */
  const score = (vector: Float64Array, hitBonus: number): number => {
    const atk = baseAtk * (1 + vector[ATK_]) + vector[ATK];
    const hp = baseHp * (1 + vector[HP_]) + vector[HP];
    const def = baseDef * (1 + vector[DEF_]) + vector[DEF];
    const em = vector[EM];

    let base = 0;
    for (const term of terms) {
      const stat =
        term.stat === 'atk' ? atk : term.stat === 'hp' ? hp : term.stat === 'def' ? def : em;
      base += term.multiplier * stat;
    }

    const amplifying =
      reaction?.kind === 'amplifying'
        ? amplifyingMultiplier({
            coefficient: reaction.coefficient,
            elementalMastery: em,
            reactionBonus: reaction.reactionBonus,
          })
        : 1;

    return (
      base *
      (1 + vector[DMG] + hitBonus) *
      constant *
      critMultiplier({ critRate: vector[CR], critDamage: vector[CD], mode: critMode }) *
      amplifying
    );
  };

  // --- candidates, by slot -----------------------------------------------

  const bySlot = new Map<
    Slot,
    { artifact: EquippedArtifact; vector: Float64Array; set: number }[]
  >();
  for (const artifact of artifacts) {
    const candidate = {
      artifact,
      vector: vectorOf(artifact, elementKey),
      set: setIndexOf.get(artifact.setKey) ?? -1,
    };
    const list = bySlot.get(artifact.slotKey);
    if (list) list.push(candidate);
    else bySlot.set(artifact.slotKey, [candidate]);
  }

  const missing = SLOT_ORDER.filter((slot) => !bySlot.get(slot)?.length);
  if (missing.length > 0) {
    return { best: [], evaluated: 0, pruned: 0, nodes: 0, exhaustive: true, missing: [...missing] };
  }

  const scratch = new Float64Array(WIDTH);
  const soloScore = (vector: Float64Array): number => {
    for (let index = 0; index < WIDTH; index++) scratch[index] = fixed[index] + vector[index];
    return score(scratch, 0);
  };

  /**
   * Slots in the order that prunes hardest: the ones where the choice matters
   * most go first, so the bound tightens before the tree gets wide.
   */
  const slots = [...SLOT_ORDER]
    .map((slot) => {
      const candidates = bySlot.get(slot) ?? [];
      candidates.sort((a, b) => soloScore(b.vector) - soloScore(a.vector));
      const first = soloScore(candidates[0].vector);
      const last = soloScore(candidates[candidates.length - 1].vector);
      return { slot, candidates, spread: first - last };
    })
    .sort((a, b) => b.spread - a.spread);

  const depth = slots.length;

  /** Per-depth running totals, so nothing is allocated inside the search. */
  const prefix: Float64Array[] = Array.from({ length: depth + 1 }, () => new Float64Array(WIDTH));
  prefix[0].set(fixed);

  /** The best each remaining slot could add, one stat at a time. */
  const suffix: Float64Array[] = Array.from({ length: depth + 1 }, () => new Float64Array(WIDTH));
  for (let atDepth = depth - 1; atDepth >= 0; atDepth--) {
    const best = new Float64Array(WIDTH);
    for (const candidate of slots[atDepth].candidates) {
      for (let index = 0; index < WIDTH; index++) {
        if (candidate.vector[index] > best[index]) best[index] = candidate.vector[index];
      }
    }
    for (let index = 0; index < WIDTH; index++) {
      suffix[atDepth][index] = suffix[atDepth + 1][index] + best[index];
    }
  }

  const counts = new Int32Array(setVectors.length);
  const chosen: EquippedArtifact[] = new Array(depth);
  const bound = new Float64Array(WIDTH);

  const results: SearchResult[] = [];
  let threshold = Number.NEGATIVE_INFINITY;
  let evaluated = 0;
  let pruned = 0;
  let nodes = 0;
  let exhaustive = true;

  const minEr = constraints.minEnergyRecharge ?? 0;

  const record = (damage: number): void => {
    // Insertion into a list of at most `top`, kept sorted.
    let at = results.length;
    while (at > 0 && results[at - 1].damage < damage) at -= 1;
    if (at >= top) return;
    results.splice(at, 0, { artifacts: chosen.slice(), damage });
    if (results.length > top) results.pop();
    if (results.length === top) threshold = results[results.length - 1].damage;
  };

  function descend(atDepth: number): void {
    if (nodes >= maxNodes) {
      exhaustive = false;
      return;
    }

    if (atDepth === depth) {
      const vector = prefix[depth];
      if (vector[ER] < minEr) return;

      let hitBonus = 0;
      scratch.set(vector);
      for (let index = 0; index < counts.length; index++) {
        if (counts[index] < 2) continue;
        const set = setVectors[index];
        for (let stat = 0; stat < WIDTH; stat++) scratch[stat] += set.vector[stat];
        hitBonus += set.hitBonus;
      }

      evaluated += 1;
      record(score(scratch, hitBonus));
      return;
    }

    const { candidates } = slots[atDepth];
    for (const candidate of candidates) {
      nodes += 1;
      if (nodes >= maxNodes) {
        exhaustive = false;
        return;
      }

      const here = prefix[atDepth];
      const next = prefix[atDepth + 1];
      for (let index = 0; index < WIDTH; index++)
        next[index] = here[index] + candidate.vector[index];

      // The optimistic completion: everything still to come, at its best, plus
      // the most generous set bonus any set could offer.
      for (let index = 0; index < WIDTH; index++) {
        bound[index] = next[index] + suffix[atDepth + 1][index] + setBest[index];
      }

      if (bound[ER] < minEr) {
        pruned += 1;
        continue;
      }
      if (results.length === top && score(bound, setBestHit) <= threshold) {
        pruned += 1;
        continue;
      }

      chosen[atDepth] = candidate.artifact;
      if (candidate.set >= 0) counts[candidate.set] += 1;
      descend(atDepth + 1);
      if (candidate.set >= 0) counts[candidate.set] -= 1;

      if (!exhaustive) return;
    }
  }

  descend(0);

  return { best: results, evaluated, pruned, nodes, exhaustive, missing: [] };
}
