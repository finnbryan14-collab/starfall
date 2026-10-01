import type { EquippedArtifact, HitBonus } from '@/engine/damage/build';
import type { SearchSet } from '@/engine/damage/search';
import type { StatMap } from '@/engine/stats/scaling';
import type { ImportedArtifact } from '@/lib/good';

import { ARTIFACT_SETS, type HitCategory } from './artifact-sets-generated';
import { mainStatValue } from './artifact-stats-generated';

/**
 * Artifact set bonuses, looked up.
 *
 * The engine is pure and knows no sets, so this is the layer that reads
 * `ARTIFACT_SETS` and hands it resolved numbers. It also decides what to say
 * about the bonuses it cannot model, which matters more than it sounds: a
 * calculator that quietly ignores a 4-piece is wrong, and one that says "you
 * have Crimson Witch 4-piece, tell me whether it is up" is merely incomplete.
 *
 * See docs/MATH.md section 8 and docs/DATA.md section 4.
 */

/**
 * An imported artifact in the shape the engine searches over.
 *
 * A GOOD export carries the main stat's *key* but not its value, because the
 * game derives the value from rarity and level — so that derivation happens
 * here, from the generated table.
 *
 * Every rarity carries all eighteen main stats — even a 1-star goblet has an
 * elemental DMG bonus. What the table has no value for is flat DEF, which is a
 * substat and never a main stat, so an export claiming it gets null rather
 * than a figure invented for it.
 */
export function equip(artifact: ImportedArtifact): EquippedArtifact | null {
  const mainValue = mainStatValue(artifact.rarity, artifact.mainStat, artifact.level);
  if (mainValue === null) return null;

  return {
    slotKey: artifact.slotKey,
    setKey: artifact.setKey,
    mainStat: artifact.mainStat,
    mainValue,
    substats: artifact.substats,
  };
}

/** The bag, as the search wants it. Pieces it cannot read are left out. */
export function equipAll(artifacts: readonly ImportedArtifact[]): EquippedArtifact[] {
  const equipped: EquippedArtifact[] = [];
  for (const artifact of artifacts) {
    const piece = equip(artifact);
    if (piece) equipped.push(piece);
  }
  return equipped;
}

/** Two of a set turns its 2-piece on; four turns the 4-piece on as well. */
export const TWO_PIECE = 2;
export const FOUR_PIECE = 4;

/** How many pieces of each set a build is wearing. */
export function activeSets(artifacts: readonly EquippedArtifact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const artifact of artifacts) {
    counts[artifact.setKey] = (counts[artifact.setKey] ?? 0) + 1;
  }
  return counts;
}

export type UnmodelledBonus = {
  setKey: string;
  name: string;
  pieces: typeof TWO_PIECE | typeof FOUR_PIECE;
  /**
   * Why Starfall is not applying it.
   *
   * `conditional` needs the player to say whether it is active. `defensive`
   * cannot change an outgoing damage number at all. `unknown` means the set is
   * not in our data — a scanner export can name a set from a patch newer than
   * the last `pnpm build:data`.
   */
  reason: 'conditional' | 'defensive' | 'unknown';
  /** The game's own wording, so a screen can show it verbatim. */
  text: string | null;
};

export type ResolvedSets = {
  /** Flat stat bonuses, ready for `assembleBuild`. */
  stats: StatMap[];
  /** Bonuses that apply to some hits only, ready for `hitDamage`. */
  hitBonuses: HitBonus[];
  /** Everything a screen has to raise with the player rather than apply. */
  unmodelled: UnmodelledBonus[];
};

/**
 * Turns piece counts into bonuses.
 *
 * A 4-piece set gives its 2-piece bonus too, which is easy to forget and worth
 * 15% of a damage figure when it is an elemental bonus.
 *
 * Every 4-piece bonus that is active comes back unmodelled. That is the
 * documented boundary rather than an omission: they are conditional by design
 * — stacks, durations, "after using an Elemental Skill" — and no dataset
 * encodes them as something executable.
 */
export function resolveSetBonuses(counts: Record<string, number>): ResolvedSets {
  const resolved: ResolvedSets = { stats: [], hitBonuses: [], unmodelled: [] };

  for (const [setKey, count] of Object.entries(counts)) {
    if (count < TWO_PIECE) continue;

    const set = ARTIFACT_SETS[setKey];
    if (!set) {
      resolved.unmodelled.push({
        setKey,
        name: setKey,
        pieces: count >= FOUR_PIECE ? FOUR_PIECE : TWO_PIECE,
        reason: 'unknown',
        text: null,
      });
      continue;
    }

    if (set.twoPieceStats) resolved.stats.push(set.twoPieceStats);
    if (set.twoPieceHitBonus) resolved.hitBonuses.push(set.twoPieceHitBonus);

    if (set.twoPieceUnmodelled === 'conditional' || set.twoPieceUnmodelled === 'defensive') {
      resolved.unmodelled.push({
        setKey,
        name: set.name,
        pieces: TWO_PIECE,
        reason: set.twoPieceUnmodelled,
        text: set.text.twoPiece,
      });
    }

    if (count >= FOUR_PIECE && set.text.fourPiece) {
      resolved.unmodelled.push({
        setKey,
        name: set.name,
        pieces: FOUR_PIECE,
        reason: 'conditional',
        text: set.text.fourPiece,
      });
    }
  }

  return resolved;
}

/**
 * Every set the search needs to know about, for one particular hit.
 *
 * The search is told about sets rather than looking them up, so this flattens
 * `ARTIFACT_SETS` into the shape it takes — with each set's hit bonus already
 * reduced to the amount that reaches *this* category, which is 0.2 for
 * Noblesse Oblige on a burst and 0 on anything else.
 */
export function searchSets(category: HitCategory): SearchSet[] {
  return Object.values(ARTIFACT_SETS).map((set) => ({
    key: set.key,
    stats: set.twoPieceStats,
    hitBonus: set.twoPieceHitBonus?.categories.includes(category) ? set.twoPieceHitBonus.amount : 0,
  }));
}

export type { HitCategory };
