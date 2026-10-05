import { ARTIFACT_SETS } from '@/data/artifact-sets-generated';
import { CHARACTERS } from '@/data/characters-generated';
import { WEAPONS, weaponScaling } from '@/data/weapons-generated';
import { critValue } from '@/engine/artifacts/model';
import { SLOT_ORDER } from '@/engine/artifacts/model';
import { weaponBaseStats, type StatMap } from '@/engine/stats/scaling';
import type { ImportedArtifact, ImportedCharacter, ImportedWeapon } from '@/lib/good';
import { readableKey } from '@/lib/good';
import { isPercentStat, statName } from '@/lib/stats';

/**
 * The imported account, read rather than optimised.
 *
 * A GOOD export carries a weapon as four fields — key, level, refinement, who
 * holds it — and nothing a player can judge it by. Its base ATK and second stat
 * live in the generated tables, so resolving the two together is this file's
 * main job, and the reason weapons could be stored for weeks without ever being
 * worth showing.
 *
 * The sorts live here rather than in the screen because they are the part that
 * can be wrong: a comparator returning 0 for two different pieces lets them
 * swap places as the player types in the filter box.
 *
 * See docs/BACKLOG.md, "The DPS calculator, expanded", step 1.
 */

/** A weapon with everything the tables know about it filled in. */
export type WeaponView = {
  id: string;
  key: string;
  name: string;
  /** Clamped to the weapon's own cap, which is 70 for the lowest rarities. */
  level: number;
  refinement: number;
  /** The character holding it, as a GOOD key, or '' when it is in the bag. */
  location: string;
  /** Null for a weapon from a patch newer than the last `pnpm build:data`. */
  rarity: number | null;
  weaponType: string | null;
  /**
   * What the weapon contributes, in engine units — fractions for percentages.
   * Hand this to `assembleBuild` or a search input; `atk` and `substatValue`
   * below are the same two numbers written the way a screen prints them.
   */
  stats: StatMap | null;
  /** Base ATK at this weapon's level and ascension. */
  atk: number | null;
  substatKey: string | null;
  /** In the artifact model's units: points for a percentage, so 66.2 not 0.662. */
  substatValue: number | null;
};

/**
 * One weapon, with its stats read off the generated tables.
 *
 * Unknown weapons come back with null stats rather than being dropped. A
 * scanner can name a weapon from a patch newer than the last `pnpm build:data`,
 * and a player who owns it should still see that they own it.
 */
export function resolveWeapon(weapon: ImportedWeapon, index = 0): WeaponView {
  const base: WeaponView = {
    id: `${weapon.key}-${index}`,
    key: weapon.key,
    name: weapon.name,
    level: weapon.level,
    refinement: weapon.refinement,
    location: weapon.location,
    rarity: null,
    weaponType: null,
    stats: null,
    atk: null,
    substatKey: null,
    substatValue: null,
  };

  const data = WEAPONS[weapon.key];
  if (!data) return base;

  /*
    Clamped rather than trusted. weaponBaseStats throws above the cap, the caps
    are not all 90 — a 1★ and 2★ weapon stops at 70 — and a scanner reporting
    one level too high would otherwise take the whole screen down.
  */
  const cap = data.ascension[data.ascension.length - 1].maxLevel;
  const level = Math.min(Math.max(weapon.level, 1), cap);

  const stats = weaponBaseStats(weaponScaling(data), level, weapon.ascension).stats;
  const substatKey = data.substatKey;
  const raw = substatKey ? stats[substatKey as keyof typeof stats] : undefined;

  return {
    ...base,
    /*
      The table's own name, not the key split on capitals. `readableKey` is a
      lossy round trip and cannot put back punctuation it never saw —
      `DragonsBane` comes out "Dragons Bane", and the weapon is Dragon's Bane.
      The GOOD-derived name stays the fallback for a weapon we do not have.
    */
    name: data.name,
    level,
    rarity: data.rarity,
    weaponType: data.weaponType,
    stats,
    atk: stats.atk ?? null,
    substatKey,
    // The engine works in fractions and every screen prints points. This is the
    // one place the two meet for a weapon.
    substatValue:
      substatKey && raw !== undefined ? (isPercentStat(substatKey) ? raw * 100 : raw) : null,
  };
}

/** Every weapon on the account, each copy with its own id. */
export function resolveWeapons(weapons: readonly ImportedWeapon[]): WeaponView[] {
  return weapons.map((weapon, index) => resolveWeapon(weapon, index));
}

/**
 * A weapon's name as the game spells it, for somewhere that only has the key.
 *
 * A character row names what they are holding without needing the weapon's
 * stats, and `ImportedWeapon.name` is the key split on capitals — which is
 * wrong for 95 of the 253 weapons.
 */
export function weaponName(key: string, fallback: string): string {
  return WEAPONS[key]?.name ?? fallback;
}

/**
 * An artifact set's name as the game spells it.
 *
 * Same reason as `weaponName`: splitting the key on capitals gives "Gladiators
 * Finale" and "Crimson Witch Of Flames". Falls back to the split key for a set
 * from a patch newer than the last `pnpm build:data`, which is the one case
 * where a rough name beats no name.
 */
export function setName(key: string): string {
  return ARTIFACT_SETS[key]?.name ?? readableKey(key);
}

/**
 * A character's name as the game spells it, from a GOOD key.
 *
 * Both a weapon and an artifact store their holder as a key, and `readableKey`
 * turns `TravelerPyro` into "Traveler Pyro" rather than "Traveler (Pyro)". An
 * empty key means nobody is holding it, and the caller says so in its own
 * words.
 */
export function characterName(key: string): string {
  return CHARACTERS[key]?.name ?? readableKey(key);
}

/** A sort a screen can offer, with the words to offer it in. */
export type SortOption<Key extends string> = { key: Key; label: string };

export type CharacterSort = 'level' | 'name' | 'rarity' | 'element';
export type WeaponSort = 'rarity' | 'atk' | 'level' | 'name' | 'type';
export type ArtifactSort = 'slot' | 'level' | 'critValue' | 'set';

export const CHARACTER_SORTS: readonly SortOption<CharacterSort>[] = [
  { key: 'level', label: 'Level' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'element', label: 'Element' },
  { key: 'name', label: 'Name' },
];

export const WEAPON_SORTS: readonly SortOption<WeaponSort>[] = [
  { key: 'rarity', label: 'Rarity' },
  { key: 'atk', label: 'Base ATK' },
  { key: 'level', label: 'Level' },
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Name' },
];

export const ARTIFACT_SORTS: readonly SortOption<ArtifactSort>[] = [
  { key: 'slot', label: 'Slot' },
  { key: 'critValue', label: 'Crit value' },
  { key: 'level', label: 'Level' },
  { key: 'set', label: 'Set' },
];

/**
 * Every comparator ends with this.
 *
 * Nothing on an account is unique enough to order by on its own — a player can
 * own four identical Favonius Lances — so the last word goes to the id, which
 * an import assigns positionally and is therefore the only total order
 * available.
 */
function byId(a: { id: string }, b: { id: string }): number {
  return a.id.localeCompare(b.id);
}

/**
 * Groups by a category, with the ungrouped last.
 *
 * A character or weapon the generated tables have never heard of has no
 * element and no type, and a blank is not a category — it belongs after every
 * real one rather than heading the list. Handled as a branch rather than by
 * sorting a sentinel string, because collation does not order punctuation
 * where you would expect: `'~'.localeCompare('a')` is −1, so the obvious
 * trick puts the unknowns first.
 */
function byCategory(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

export function sortCharacters(
  characters: readonly ImportedCharacter[],
  sort: CharacterSort,
): ImportedCharacter[] {
  const rarity = (entry: ImportedCharacter): number => CHARACTERS[entry.key]?.rarity ?? 0;
  const element = (entry: ImportedCharacter): string | null =>
    CHARACTERS[entry.key]?.element ?? null;

  const name = (a: ImportedCharacter, b: ImportedCharacter): number =>
    a.name.localeCompare(b.name) || a.key.localeCompare(b.key);

  return [...characters].sort((a, b) => {
    switch (sort) {
      case 'level':
        return b.level - a.level || b.constellation - a.constellation || name(a, b);
      case 'rarity':
        return rarity(b) - rarity(a) || b.level - a.level || name(a, b);
      case 'element':
        return byCategory(element(a), element(b)) || b.level - a.level || name(a, b);
      case 'name':
        return name(a, b);
    }
  });
}

export function sortWeapons(weapons: readonly WeaponView[], sort: WeaponSort): WeaponView[] {
  const name = (a: WeaponView, b: WeaponView): number => a.name.localeCompare(b.name) || byId(a, b);

  return [...weapons].sort((a, b) => {
    switch (sort) {
      case 'rarity':
        return (b.rarity ?? 0) - (a.rarity ?? 0) || b.level - a.level || name(a, b);
      case 'atk':
        return (b.atk ?? 0) - (a.atk ?? 0) || name(a, b);
      case 'level':
        return b.level - a.level || (b.rarity ?? 0) - (a.rarity ?? 0) || name(a, b);
      case 'type':
        return byCategory(a.weaponType, b.weaponType) || name(a, b);
      case 'name':
        return name(a, b);
    }
  });
}

export function sortArtifacts(
  artifacts: readonly ImportedArtifact[],
  sort: ArtifactSort,
): ImportedArtifact[] {
  const set = (a: ImportedArtifact, b: ImportedArtifact): number =>
    setName(a.setKey).localeCompare(setName(b.setKey));

  return [...artifacts].sort((a, b) => {
    switch (sort) {
      case 'slot':
        return (
          SLOT_ORDER.indexOf(a.slotKey) - SLOT_ORDER.indexOf(b.slotKey) ||
          b.level - a.level ||
          set(a, b) ||
          byId(a, b)
        );
      case 'critValue':
        return critValue(b.substats) - critValue(a.substats) || b.level - a.level || byId(a, b);
      case 'level':
        return b.level - a.level || set(a, b) || byId(a, b);
      case 'set':
        return (
          set(a, b) ||
          SLOT_ORDER.indexOf(a.slotKey) - SLOT_ORDER.indexOf(b.slotKey) ||
          b.level - a.level ||
          byId(a, b)
        );
    }
  });
}

/**
 * Whether a needle appears anywhere worth searching on this row.
 *
 * Holders are stored as GOOD keys, so "hu tao" has to match `HuTao` — the
 * readable form is what a player types. Stat keys get the same treatment, since
 * "crit dmg" is the search and `cd` is the storage.
 */
export function matchesCharacter(character: ImportedCharacter, needle: string): boolean {
  if (!needle) return true;
  const data = CHARACTERS[character.key];
  return haystack([
    characterName(character.key),
    character.name,
    character.weapon ? weaponName(character.weapon.key, character.weapon.name) : '',
    data?.element ?? '',
    data?.weaponType ?? '',
  ]).includes(needle);
}

export function matchesWeapon(weapon: WeaponView, needle: string): boolean {
  if (!needle) return true;
  return haystack([
    weapon.name,
    weapon.weaponType ?? '',
    characterName(weapon.location),
    weapon.substatKey ? statName(weapon.substatKey) : '',
  ]).includes(needle);
}

export function matchesArtifact(artifact: ImportedArtifact, needle: string): boolean {
  if (!needle) return true;
  return haystack([
    setName(artifact.setKey),
    artifact.slotKey,
    characterName(artifact.location),
    statName(artifact.mainStat),
    ...Object.keys(artifact.substats).map(statName),
  ]).includes(needle);
}

/**
 * One lowercase string to search, with the apostrophes also stripped.
 *
 * Both spellings, because both are things a player types: the game writes
 * Gladiator's Finale and Amos' Bow, and nobody reaches for the apostrophe key
 * halfway through filtering a four-hundred-piece bag. Searching the
 * punctuated form still works — this only adds a second spelling, it does not
 * replace the first.
 */
function haystack(parts: readonly string[]): string {
  const joined = parts.join(' ').toLowerCase();
  const plain = joined.replace(/['’]/g, '');
  return plain === joined ? joined : `${joined} ${plain}`;
}

export type InventoryTotals = {
  characters: number;
  artifacts: number;
  weapons: number;
  /** Pieces sitting in the bag doing nothing — the number worth acting on. */
  idleArtifacts: number;
  idleWeapons: number;
  /** Characters wearing a full five pieces and holding a weapon. */
  equippedCharacters: number;
};

export function inventoryTotals(
  characters: readonly ImportedCharacter[],
  artifacts: readonly ImportedArtifact[],
  weapons: readonly WeaponView[],
): InventoryTotals {
  return {
    characters: characters.length,
    artifacts: artifacts.length,
    weapons: weapons.length,
    idleArtifacts: artifacts.filter((artifact) => !artifact.location).length,
    idleWeapons: weapons.filter((weapon) => !weapon.location).length,
    equippedCharacters: characters.filter(
      (character) => character.artifactCount >= FULL_SET && character.weapon !== null,
    ).length,
  };
}

/** Five slots, which is what "fully equipped" means. */
const FULL_SET = 5;
