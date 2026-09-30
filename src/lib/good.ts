import { z } from 'zod';

import type { MainStatKey, Slot, SubstatKey, Substats } from '@/engine/artifacts/model';

/**
 * GOOD inventory import.
 *
 * Enka only returns showcased characters and what they are wearing. Everything
 * else — the four hundred artifacts in the bag — comes from a community scanner
 * (Inventory Kamera and friends) exporting Genshin Open Object Description,
 * the format Genshin Optimizer reads.
 *
 * The schema below follows genshin-optimizer's own, narrowed to what Starfall
 * uses and kept deliberately forgiving about the rest: scanners are third-party
 * tools of varying quality, and a file with one odd weapon in it should still
 * bring four hundred good artifacts across.
 *
 *   https://github.com/frzyc/genshin-optimizer/blob/master/libs/gi/good/src/schemas/good-format.ts
 *   https://github.com/frzyc/genshin-optimizer/blob/master/libs/gi/consts/src/artifact.ts
 *   verifiedAt: 2026-09-29
 *
 * See docs/DATA.md section 2.
 */

/** Versions of the format this understands. */
export const SUPPORTED_GOOD_VERSIONS = [1, 2, 3] as const;

/**
 * GOOD's stat keys against ours.
 *
 * The names differ (`eleMas` against `em`) and so does the convention for
 * percentages: GOOD suffixes them with `_`. Mapping explicitly rather than
 * rewriting strings means an unknown key is *noticed* instead of silently
 * becoming a plausible-looking stat.
 */
export const GOOD_SUBSTAT_KEYS: Record<string, SubstatKey> = {
  hp: 'hp',
  hp_: 'hp_',
  atk: 'atk',
  atk_: 'atk_',
  def: 'def',
  def_: 'def_',
  eleMas: 'em',
  enerRech_: 'er',
  critRate_: 'cr',
  critDMG_: 'cd',
};

export const GOOD_MAIN_STAT_KEYS: Record<string, MainStatKey> = {
  ...GOOD_SUBSTAT_KEYS,
  physical_dmg_: 'physical_dmg',
  anemo_dmg_: 'anemo_dmg',
  geo_dmg_: 'geo_dmg',
  electro_dmg_: 'electro_dmg',
  hydro_dmg_: 'hydro_dmg',
  pyro_dmg_: 'pyro_dmg',
  cryo_dmg_: 'cryo_dmg',
  dendro_dmg_: 'dendro_dmg',
  heal_: 'heal',
};

const SLOTS: readonly Slot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

const goodSubstat = z.object({
  key: z.string(),
  value: z.number().finite(),
});

const goodArtifact = z.looseObject({
  setKey: z.string().min(1),
  slotKey: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']),
  level: z.number().int().min(0).max(20),
  rarity: z.number().int().min(1).max(5),
  mainStatKey: z.string().min(1),
  location: z.string().optional(),
  lock: z.boolean().optional(),
  substats: z.array(goodSubstat),
});

/**
 * Talent levels, which only a scanner export carries.
 *
 * No API exposes them — not Enka, not HoYoLAB's Chronicle — and a damage
 * calculation is wrong without them, since the multiplier is read off the
 * level.
 */
const goodTalent = z.looseObject({
  auto: z.number().int().min(1).max(15).optional(),
  skill: z.number().int().min(1).max(15).optional(),
  burst: z.number().int().min(1).max(15).optional(),
});

const goodCharacter = z.looseObject({
  key: z.string().min(1),
  level: z.number().int().min(1).max(90).optional(),
  constellation: z.number().int().min(0).max(6).optional(),
  ascension: z.number().int().min(0).max(6).optional(),
  talent: goodTalent.optional(),
});

const goodWeapon = z.looseObject({
  key: z.string().min(1),
  level: z.number().int().min(1).max(90).optional(),
  ascension: z.number().int().min(0).max(6).optional(),
  refinement: z.number().int().min(1).max(5).optional(),
  location: z.string().optional(),
});

export const goodSchema = z.looseObject({
  format: z.literal('GOOD'),
  version: z.number().int(),
  source: z.string().optional(),
  characters: z.array(goodCharacter).optional(),
  artifacts: z.array(goodArtifact).optional(),
  weapons: z.array(goodWeapon).optional(),
});

export type GoodFile = z.infer<typeof goodSchema>;
export type GoodArtifact = z.infer<typeof goodArtifact>;

/**
 * A character as the app uses one.
 *
 * `key` is GOOD's PascalCase name — "KamisatoAyaka". Kept as-is rather than
 * prettified, because it is the join key against every other dataset and a
 * display name is a lossy round trip.
 */
export type ImportedCharacter = {
  key: string;
  /** "KamisatoAyaka" -> "Kamisato Ayaka", for reading. */
  name: string;
  level: number;
  ascension: number;
  constellation: number;
  talent: { auto: number; skill: number; burst: number };
  /** The weapon they are holding, if the export says. */
  weapon: ImportedWeapon | null;
  /** How many artifacts in the bag are equipped on them. */
  artifactCount: number;
};

export type ImportedWeapon = {
  key: string;
  name: string;
  level: number;
  ascension: number;
  refinement: number;
  /** The character holding it, or '' when it is in the bag. */
  location: string;
};

/** `KamisatoAyaka` -> `Kamisato Ayaka`. */
export function readableKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

export function toImportedWeapons(good: GoodFile): ImportedWeapon[] {
  return (good.weapons ?? []).map((weapon) => ({
    key: weapon.key,
    name: readableKey(weapon.key),
    level: weapon.level ?? 1,
    ascension: weapon.ascension ?? 0,
    refinement: weapon.refinement ?? 1,
    location: weapon.location ?? '',
  }));
}

/**
 * Every character in the export, with what they are holding and wearing.
 *
 * The weapon and artifact counts are resolved here rather than at render time
 * because GOOD expresses both as a `location` back-reference, and a screen
 * should not have to know that.
 */
export function toImportedCharacters(good: GoodFile): ImportedCharacter[] {
  const weapons = toImportedWeapons(good);
  const equipped = new Map(weapons.filter((w) => w.location).map((w) => [w.location, w]));

  const worn = new Map<string, number>();
  for (const artifact of good.artifacts ?? []) {
    if (!artifact.location) continue;
    worn.set(artifact.location, (worn.get(artifact.location) ?? 0) + 1);
  }

  return (good.characters ?? [])
    .map((character) => ({
      key: character.key,
      name: readableKey(character.key),
      level: character.level ?? 1,
      ascension: character.ascension ?? 0,
      constellation: character.constellation ?? 0,
      talent: {
        auto: character.talent?.auto ?? 1,
        skill: character.talent?.skill ?? 1,
        burst: character.talent?.burst ?? 1,
      },
      weapon: equipped.get(character.key) ?? null,
      artifactCount: worn.get(character.key) ?? 0,
    }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export type GoodFailure = 'not-json' | 'not-good' | 'unsupported-version' | 'malformed';

export const GOOD_FAILURE_COPY: Record<GoodFailure, string> = {
  'not-json': 'That file isn’t JSON. Export again from your scanner and pick the .json file.',
  'not-good':
    'That’s JSON, but not a GOOD export. Inventory Kamera and the Android scanners all produce one.',
  'unsupported-version':
    'That export uses a newer GOOD version than Starfall knows. Update Starfall, then try again.',
  malformed: 'That export is damaged — its artifact list isn’t the shape GOOD describes.',
};

export type GoodCounts = {
  artifacts: number;
  characters: number;
  weapons: number;
  /** Artifacts dropped because a stat key was not recognised. */
  skipped: number;
};

export type ParsedGood =
  | { ok: true; good: GoodFile; counts: GoodCounts; source: string }
  | { ok: false; reason: GoodFailure };

export function parseGood(text: string): ParsedGood {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }

  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== 'GOOD') {
    return { ok: false, reason: 'not-good' };
  }

  // Checked before the full parse so a future export gets the message that says
  // what to do, rather than a list of shape errors.
  const version = (raw as { version?: unknown }).version;
  if (
    typeof version !== 'number' ||
    !SUPPORTED_GOOD_VERSIONS.includes(version as (typeof SUPPORTED_GOOD_VERSIONS)[number])
  ) {
    return { ok: false, reason: 'unsupported-version' };
  }

  const parsed = goodSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'malformed' };

  const artifacts = parsed.data.artifacts ?? [];
  const usable = artifacts.filter((artifact) => GOOD_MAIN_STAT_KEYS[artifact.mainStatKey]);

  return {
    ok: true,
    good: parsed.data,
    source: parsed.data.source?.trim() || 'an unnamed scanner',
    counts: {
      artifacts: usable.length,
      characters: parsed.data.characters?.length ?? 0,
      weapons: parsed.data.weapons?.length ?? 0,
      skipped: artifacts.length - usable.length,
    },
  };
}

export type ImportedArtifact = {
  id: string;
  setKey: string;
  slotKey: Slot;
  location: string;
  rarity: number;
  level: number;
  mainStat: MainStatKey;
  substats: Substats;
  lock: boolean;
};

/**
 * GOOD artifacts in the shape the scorer and the store use.
 *
 * Ids are positional. Content hashing would be the obvious alternative and is
 * wrong here: two genuinely different artifacts can have identical stats, and
 * collapsing them would quietly shrink a player's inventory. An import replaces
 * the previous snapshot wholesale (docs/DATA.md), so position is stable enough.
 *
 * An artifact with a main stat we do not recognise is dropped rather than
 * guessed at, and `parseGood` counts those so the confirm step can say so.
 */
export function toImportedArtifacts(good: GoodFile): ImportedArtifact[] {
  const artifacts = good.artifacts ?? [];
  const imported: ImportedArtifact[] = [];

  artifacts.forEach((artifact, index) => {
    const mainStat = GOOD_MAIN_STAT_KEYS[artifact.mainStatKey];
    if (!mainStat) return;

    const substats: Substats = {};
    for (const substat of artifact.substats) {
      const key = GOOD_SUBSTAT_KEYS[substat.key];
      // An empty `key` is how GOOD spells an unrolled fourth line.
      if (!key || substat.value === 0) continue;
      substats[key] = (substats[key] ?? 0) + substat.value;
    }

    imported.push({
      id: `good-${index}`,
      setKey: artifact.setKey,
      slotKey: artifact.slotKey as Slot,
      location: artifact.location ?? '',
      rarity: artifact.rarity,
      level: artifact.level,
      mainStat,
      substats,
      lock: artifact.lock ?? false,
    });
  });

  return imported;
}

/** "312 artifacts, 41 characters" — what the confirm step shows. */
export function describeGood(counts: GoodCounts): string {
  const parts: string[] = [];
  const say = (n: number, one: string) =>
    n > 0 ? parts.push(`${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`) : undefined;

  say(counts.artifacts, 'artifact');
  say(counts.characters, 'character');
  say(counts.weapons, 'weapon');

  return parts.length > 0 ? parts.join(', ') : 'nothing at all';
}

/** Every slot, so the confirm step can show a file missing a whole slot. */
export function countBySlot(artifacts: readonly ImportedArtifact[]): Record<Slot, number> {
  const counts = Object.fromEntries(SLOTS.map((slot) => [slot, 0])) as Record<Slot, number>;
  for (const artifact of artifacts) counts[artifact.slotKey] += 1;
  return counts;
}
