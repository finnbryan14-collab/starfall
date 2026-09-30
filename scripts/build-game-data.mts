import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Generates the game data the damage engine needs.
 *
 *   src/data/characters-generated.ts   identity, base stats, ascension curves
 *   src/data/weapons-generated.ts      the same for all 255 weapons
 *   public/data/talents/<Key>.json     talent damage multipliers, per character
 *
 * ## Where the numbers come from
 *
 * genshin-db, which is generated from the game's own ExcelBinOutput rather than
 * scraped, so the stat tables are exact. It is a devDependency and never ships:
 * 178 MB of it stays in node_modules and only what is written below is
 * committed.
 *
 * The stat tables were cross-checked against the wiki's published ascension
 * tables for Hu Tao, Bennett and Staff of Homa before any of this was written —
 * every figure agreed to the two decimals the wiki prints. See
 * src/engine/stats/scaling.test.ts, which asserts those published values.
 *
 * ## Why the keys come from somewhere else
 *
 * A character is joined to the rest of the app by its GOOD key — `HuTao`,
 * `KamisatoAyaka` — because that is what a scanner export carries. Deriving one
 * from a display name works for 118 of 124 characters, which is not good
 * enough: the six exceptions would each be a character silently missing from
 * the roster. So the derived key is checked against genshin-optimizer's own
 * published list, and anything unmatched is reported by name.
 *
 * ## Talents are split per character, not bundled
 *
 * All of them together are 407 KB, and a screen only ever wants one character
 * at a time. One file each is ~3 KB, cached by the service worker on first use.
 *
 * Fails loudly rather than writing a partial file. A quietly truncated table
 * would make a damage figure wrong in a way nobody would think to check.
 *
 * Run: pnpm build:data
 */

const require = createRequire(import.meta.url);

const GO_CONSTS =
  'https://raw.githubusercontent.com/frzyc/genshin-optimizer/master/libs/gi/consts/src';
const GENSHIN_DB_DATA = 'genshin-db/src/min/data.min.json';

const OUT_CHARACTERS = path.join(process.cwd(), 'src', 'data', 'characters-generated.ts');
const OUT_WEAPONS = path.join(process.cwd(), 'src', 'data', 'weapons-generated.ts');
const OUT_TALENTS = path.join(process.cwd(), 'public', 'data', 'talents');

/** Levels the game now allows. Characters reach 100; no weapon passes 90. */
const MAX_CHARACTER_LEVEL = 100;
const MAX_WEAPON_LEVEL = 90;

/**
 * The slice of genshin-db this script uses.
 *
 * Its own types ship with the package but describe every language and every
 * field; naming only what is read here means a rename upstream surfaces as a
 * type error on the line that cares.
 */
type DbQuery<T> = {
  (query: 'names', options: { matchCategories: true }): string[];
  (name: string): T | undefined;
};

type LevelStats = { hp: number; attack: number; defense: number };

type DbCharacter = {
  elementText?: string;
  weaponText: string;
  rarity: 4 | 5;
  stats: (level: number, phase: number) => LevelStats | undefined;
};

type DbWeapon = {
  weaponText: string;
  rarity: number;
  stats: (level: number, phase: number) => { attack: number; specialized: number } | undefined;
};

type DbCombat = {
  name: string;
  attributes?: { labels: string[]; parameters: Record<string, number[]> };
};

type DbTalent = Record<string, DbCombat | undefined>;

type Db = {
  characters: DbQuery<DbCharacter>;
  weapons: DbQuery<DbWeapon>;
  talents: DbQuery<DbTalent>;
};

type RawPromotion = {
  maxlevel: number;
  hp?: number;
  attack?: number;
  defense?: number;
  specialized?: number;
};

type RawCharacterStats = {
  base: { hp: number; attack: number; defense: number; critrate: number; critdmg: number };
  curve: { hp: string; attack: string; defense: string };
  specialized: string;
  promotion: RawPromotion[];
};

type RawWeaponStats = {
  base: { attack: number; specialized: number };
  curve: { attack: string; specialized?: string };
  specialized: string;
  promotion: RawPromotion[];
};

type RawData = {
  version: string;
  stats: { characters: Record<string, RawCharacterStats>; weapons: Record<string, RawWeaponStats> };
  curve: {
    characters: Record<string, Record<string, number>>;
    weapons: Record<string, Record<string, number>>;
  };
};

/**
 * The game's stat identifiers against ours.
 *
 * Explicit rather than derived, so a stat the game adds later shows up as an
 * error naming itself instead of quietly becoming something plausible.
 */
const FIGHT_PROP: Record<string, string> = {
  FIGHT_PROP_HP_PERCENT: 'hp_',
  FIGHT_PROP_ATTACK_PERCENT: 'atk_',
  FIGHT_PROP_DEFENSE_PERCENT: 'def_',
  FIGHT_PROP_CRITICAL: 'cr',
  FIGHT_PROP_CRITICAL_HURT: 'cd',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'er',
  FIGHT_PROP_ELEMENT_MASTERY: 'em',
  FIGHT_PROP_HEAL_ADD: 'heal',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'physical_dmg',
  FIGHT_PROP_FIRE_ADD_HURT: 'pyro_dmg',
  FIGHT_PROP_WATER_ADD_HURT: 'hydro_dmg',
  FIGHT_PROP_ELEC_ADD_HURT: 'electro_dmg',
  FIGHT_PROP_ICE_ADD_HURT: 'cryo_dmg',
  FIGHT_PROP_WIND_ADD_HURT: 'anemo_dmg',
  FIGHT_PROP_ROCK_ADD_HURT: 'geo_dmg',
  FIGHT_PROP_GRASS_ADD_HURT: 'dendro_dmg',
};

const ELEMENTS = ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'] as const;

/** `Hu Tao` -> `HuTao`, `Amos' Bow` -> `AmosBow`. */
function goodKey(name: string): string {
  return name
    .replace(/['’"“”]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/** Every quoted string literal inside one `export const <name> = [...]`. */
function keyArray(source: string, name: string): string[] {
  const start = source.indexOf(`export const ${name} = [`);
  if (start < 0) throw new Error(`genshin-optimizer no longer exports ${name}`);
  const end = source.indexOf(']', start);
  const keys = [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (keys.length === 0) throw new Error(`${name} came back empty — the format has changed`);
  return keys;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

/**
 * The GOOD keys the ecosystem actually uses.
 *
 * genshin-optimizer lags genshin-db by a patch or two, so a brand-new character
 * legitimately will not be in here. Those are reported and kept under their
 * derived key — which is the key a scanner will use once it catches up.
 */
async function officialKeys(): Promise<{ characters: Set<string>; weapons: Set<string> }> {
  const [characterSource, weaponSource] = await Promise.all([
    fetchText(`${GO_CONSTS}/character.ts`),
    fetchText(`${GO_CONSTS}/weapon.ts`),
  ]);

  const weapons = new Set<string>();
  for (const type of ['Sword', 'Claymore', 'Polearm', 'Bow', 'Catalyst']) {
    for (const key of keyArray(weaponSource, `allWeapon${type}Keys`)) weapons.add(key);
  }

  return {
    characters: new Set([
      ...keyArray(characterSource, 'nonTravelerCharacterKeys'),
      ...keyArray(characterSource, 'allTravelerKeys'),
    ]),
    weapons,
  };
}

/** Reads a curve table into `LevelCurve` arrays, indexed by level - 1. */
function curveTable(
  raw: Record<string, Record<string, number>>,
  maxLevel: number,
): Record<string, number[]> {
  const table: Record<string, number[]> = {};

  for (let level = 1; level <= maxLevel; level++) {
    const row = raw[String(level)];
    if (!row) throw new Error(`the curve table has no level ${level}`);
    for (const [name, value] of Object.entries(row)) {
      (table[name] ??= new Array<number>(maxLevel).fill(Number.NaN))[level - 1] = value;
    }
  }

  for (const [name, curve] of Object.entries(table)) {
    const hole = curve.findIndex((value) => !Number.isFinite(value));
    if (hole >= 0) throw new Error(`curve ${name} has no value at level ${hole + 1}`);
  }

  return table;
}

// ---------------------------------------------------------------------------
// Talents
// ---------------------------------------------------------------------------

/** What a damage term scales off. Absent in the label means ATK. */
const SCALING_STATS: [RegExp, string][] = [
  [/^Max HP\b/i, 'hp'],
  [/^Current HP\b/i, 'hp'],
  [/^HP\b/i, 'hp'],
  [/^ATK\b/i, 'atk'],
  [/^DEF\b/i, 'def'],
  [/^Elemental Mastery\b/i, 'em'],
];

type TalentPart = {
  /** What joins this part to the one before: '' for the first, then '+' or '/'. */
  join: string;
  stat: string;
  /** One multiplier per talent level, 1 to 15. */
  values: number[];
};

type TalentHit = { label: string; parts: TalentPart[] };

/**
 * Everything a label can be that is not a hit.
 *
 * Long because the game writes these by hand, and a few of the words have to be
 * anchored: `ratio` unanchored is a substring of "Incineration" and "Mini-
 * Stration", and both of those really are hits.
 */
const NOT_DAMAGE =
  /bonus|absorb|resistance|reduction|increase|decrease|interval|duration|multiplier|cost|consumption|regenerat|restored|healing|conversion|ratio|rate|chance|resolve|maximum|mitigation|inherited|gain|RES|SPD|CD|stamina|energy|shield|heal/i;

/**
 * A hit, or something else.
 *
 * Labels are free text, so this is a judgement rather than a fact, and it is
 * made here at build time so the result sits in a committed file where it can
 * be read — rather than being decided again on every render.
 *
 * Matching on the word "DMG" alone was the obvious rule and it was wrong twice
 * over. It missed 61 real hits, because "Aimed Shot", "Charged Attack", "DoT",
 * "Riptide Slash" and "Life Drain" never say DMG — and for a bow character the
 * aimed shot is most of the damage. It also let in sixteen "Shield DMG
 * Absorption" labels, which are shield strength.
 *
 * So the shape of the template decides first: a hit is a pure multiplier, every
 * term a percentage. A shield always carries a flat term alongside. Then the
 * name rules out what is a bonus, a cost or a heal.
 */
function isDamageLabel(name: string, template: string): boolean {
  const formats = [...template.matchAll(/\{param\d+:([^}]*)\}/g)].map((match) => match[1]);
  if (formats.length === 0 || !formats.every((format) => format.endsWith('P'))) return false;
  return !NOT_DAMAGE.test(name);
}

/**
 * Splits `{param3:F1P} ATK+{param4:F1P} Elemental Mastery` into its terms.
 *
 * The join matters and is kept: `+` sums two scalings of one hit, while `/`
 * separates alternatives — a low and a high plunge are two different hits that
 * happen to share a label. Deciding which is which is the caller's business.
 */
function parseTemplate(
  template: string,
  parameters: Record<string, number[]>,
): TalentPart[] | null {
  const parts: TalentPart[] = [];
  const pattern = /\{(param\d+):[^}]*\}\s*([A-Za-z][A-Za-z ]*)?/g;
  let previousEnd = 0;

  for (const match of template.matchAll(pattern)) {
    const values = parameters[match[1]];
    if (!values) return null;

    const between = template.slice(previousEnd, match.index).trim();
    previousEnd = match.index + match[0].length;

    const trailing = (match[2] ?? '').trim();
    const stat = SCALING_STATS.find(([test]) => test.test(trailing))?.[1] ?? 'atk';

    parts.push({
      join: parts.length === 0 ? '' : between.includes('/') ? '/' : '+',
      stat,
      values: values.map((value) => Math.round(value * 1e6) / 1e6),
    });
  }

  return parts.length > 0 ? parts : null;
}

type TalentSet = Record<string, { name: string; hits: TalentHit[] }>;

function parseTalents(talent: Record<string, unknown>): TalentSet {
  const combats: [string, string][] = [
    ['combat1', 'normal'],
    ['combat2', 'skill'],
    ['combat3', 'burst'],
  ];
  const out: TalentSet = {};

  for (const [source, name] of combats) {
    const entry = talent[source] as
      | { name: string; attributes?: { labels: string[]; parameters: Record<string, number[]> } }
      | undefined;
    if (!entry?.attributes) continue;

    const hits: TalentHit[] = [];
    for (const label of entry.attributes.labels) {
      const [text, template] = label.split('|');
      if (!template || !isDamageLabel(text, template)) continue;
      const parts = parseTemplate(template, entry.attributes.parameters);
      if (parts) hits.push({ label: text.trim(), parts });
    }

    if (hits.length > 0) out[name] = { name: entry.name, hits };
  }

  return out;
}

// ---------------------------------------------------------------------------

function header(source: string): string {
  return [
    `// Generated by scripts/build-game-data.mts on ${new Date().toISOString().slice(0, 10)}.`,
    '// Do not edit by hand. Re-run `pnpm build:data` each patch.',
    '//',
    `// Source: ${source}`,
    '',
  ].join('\n');
}

/** Compact enough to read in a diff: one record per line. */
function line(value: unknown): string {
  return JSON.stringify(value);
}

async function main(): Promise<void> {
  const db = require('genshin-db') as Db;
  const raw = require(GENSHIN_DB_DATA) as RawData;
  const dbVersion = (require('genshin-db/package.json') as { version: string }).version;
  const official = await officialKeys();

  const characterCurves = curveTable(raw.curve.characters, MAX_CHARACTER_LEVEL);
  const weaponCurves = curveTable(raw.curve.weapons, MAX_WEAPON_LEVEL);

  const unlisted: string[] = [];
  const elementless: string[] = [];

  // --- characters ---------------------------------------------------------

  const talentNames: string[] = db.talents('names', { matchCategories: true });
  const travelerTalents = new Map<string, string>();
  for (const name of talentNames) {
    const match = /^Traveler \((\w+)\)$/.exec(name);
    if (match) travelerTalents.set(match[1].toLowerCase(), name);
  }

  type Emitted = { key: string; record: string; talentName: string };
  const characters: Emitted[] = [];

  for (const name of db.characters('names', { matchCategories: true }) as string[]) {
    const info = db.characters(name);
    const stats = raw.stats.characters[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (!info || !stats) throw new Error(`no stat table for ${name}`);

    const bonusStat = FIGHT_PROP[stats.specialized];
    if (!bonusStat) throw new Error(`unknown ascension stat ${stats.specialized} on ${name}`);

    // Aether and Lumine share one stat table and seven sets of talents. GOOD
    // keys them by element instead, so they are emitted that way — and only
    // once, because a second copy under the other twin's name would be the
    // same character twice in the roster.
    const isTraveler = /^(Aether|Lumine)$/.test(name);
    if (isTraveler && name === 'Lumine') continue;

    const targets = isTraveler
      ? ELEMENTS.filter((element) => travelerTalents.has(element)).map((element) => ({
          key: `Traveler${element.charAt(0).toUpperCase()}${element.slice(1)}`,
          display: `Traveler (${element.charAt(0).toUpperCase()}${element.slice(1)})`,
          element,
          talentName: travelerTalents.get(element)!,
        }))
      : [
          {
            key: goodKey(name),
            display: name,
            element: String(info.elementText ?? '').toLowerCase(),
            talentName: name,
          },
        ];

    for (const target of targets) {
      if (!official.characters.has(target.key)) unlisted.push(`${name} -> ${target.key}`);

      // A couple of characters carry no element in the game data. Emitted as
      // null and reported, rather than guessed at: an elemental DMG bonus that
      // applied to the wrong element would be a silently inflated number.
      const element = ELEMENTS.includes(target.element as (typeof ELEMENTS)[number])
        ? target.element
        : null;
      if (!element) elementless.push(target.key);

      characters.push({
        key: target.key,
        talentName: target.talentName,
        record: line({
          key: target.key,
          name: target.display,
          element,
          weaponType: String(info.weaponText).toLowerCase(),
          rarity: info.rarity,
          base: { hp: stats.base.hp, atk: stats.base.attack, def: stats.base.defense },
          curve: {
            hp: stats.curve.hp,
            atk: stats.curve.attack,
            def: stats.curve.defense,
          },
          bonusStat,
          ascension: stats.promotion.map((phase) => ({
            maxLevel: phase.maxlevel,
            hp: phase.hp ?? 0,
            atk: phase.attack ?? 0,
            def: phase.defense ?? 0,
            bonus: phase.specialized ?? 0,
          })),
        }),
      });
    }
  }

  characters.sort((a, b) => a.key.localeCompare(b.key));

  // --- weapons -----------------------------------------------------------

  const weapons: { key: string; record: string }[] = [];
  const emittedWeapons = new Set<string>();
  const collisions: string[] = [];

  for (const name of db.weapons('names', { matchCategories: true }) as string[]) {
    const info = db.weapons(name);
    const stats = raw.stats.weapons[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (!info || !stats) throw new Error(`no stat table for weapon ${name}`);

    const key = goodKey(name);

    // Three quest weapons share the name "Prized Isshin Blade" across three
    // rarities, so a name-derived key cannot tell them apart. Keeping the first
    // and reporting the rest beats emitting the same key three times; none of
    // them is in genshin-optimizer's list either, so nothing downstream asks
    // for them.
    if (emittedWeapons.has(key)) {
      collisions.push(`${name} -> ${key}`);
      continue;
    }
    emittedWeapons.add(key);

    if (!official.weapons.has(key)) unlisted.push(`${name} -> ${key}`);

    // A handful of low-rarity weapons carry no second stat at all.
    const substatKey = stats.specialized ? FIGHT_PROP[stats.specialized] : null;
    if (stats.specialized && !substatKey) {
      throw new Error(`unknown substat ${stats.specialized} on ${name}`);
    }

    weapons.push({
      key,
      record: line({
        key,
        name,
        weaponType: String(info.weaponText).toLowerCase(),
        rarity: info.rarity,
        base: { atk: stats.base.attack, substat: stats.base.specialized },
        curve: { atk: stats.curve.attack, substat: stats.curve.specialized ?? null },
        substatKey,
        ascension: stats.promotion.map((phase) => ({
          maxLevel: phase.maxlevel,
          atk: phase.attack ?? 0,
        })),
      }),
    });
  }

  weapons.sort((a, b) => a.key.localeCompare(b.key));

  // --- the self-check ----------------------------------------------------
  //
  // Every character at every level and phase, against genshin-db's own stat
  // function. It costs a second and it is the only thing standing between a
  // transcription slip and a damage figure that is wrong everywhere.

  let checked = 0;
  for (const name of db.characters('names', { matchCategories: true }) as string[]) {
    const stats = raw.stats.characters[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
    const compute = db.characters(name)?.stats;
    if (!compute) throw new Error(`no stat function for ${name}`);

    for (let level = 1; level <= MAX_CHARACTER_LEVEL; level++) {
      for (let phase = 0; phase < stats.promotion.length; phase++) {
        const step = stats.promotion[phase];
        const previous = phase > 0 ? stats.promotion[phase - 1].maxlevel : 1;
        if (level > step.maxlevel && phase < stats.promotion.length - 1) continue;
        if (level < previous) continue;

        const theirs = compute(level, phase);
        if (!theirs) throw new Error(`${name} has no stats at ${level}/${phase}`);
        const ours = {
          hp: stats.base.hp * characterCurves[stats.curve.hp][level - 1] + (step.hp ?? 0),
          attack:
            stats.base.attack * characterCurves[stats.curve.attack][level - 1] + (step.attack ?? 0),
          defense:
            stats.base.defense * characterCurves[stats.curve.defense][level - 1] +
            (step.defense ?? 0),
        };

        for (const stat of ['hp', 'attack', 'defense'] as const) {
          if (Math.abs(theirs[stat] - ours[stat]) > 1e-6) {
            throw new Error(
              `${name} at ${level}/${phase}: ${stat} is ${ours[stat]}, genshin-db says ${theirs[stat]}`,
            );
          }
        }
        checked += 1;
      }
    }
  }

  // Weapons get the same treatment, and it matters more here: the raw stat
  // tables are keyed by a flattened filename, so a lookup that picked the wrong
  // record would produce plausible base ATK for the wrong weapon.
  for (const name of db.weapons('names', { matchCategories: true }) as string[]) {
    const stats = raw.stats.weapons[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
    const compute = db.weapons(name)?.stats;
    if (!compute) throw new Error(`no stat function for weapon ${name}`);
    const cap = stats.promotion[stats.promotion.length - 1].maxlevel;

    for (let level = 1; level <= cap; level++) {
      for (let phase = 0; phase < stats.promotion.length; phase++) {
        const step = stats.promotion[phase];
        const previous = phase > 0 ? stats.promotion[phase - 1].maxlevel : 1;
        if (level > step.maxlevel && phase < stats.promotion.length - 1) continue;
        if (level < previous) continue;

        const theirs = compute(level, phase);
        if (!theirs) throw new Error(`${name} has no stats at ${level}/${phase}`);
        const ours =
          stats.base.attack * weaponCurves[stats.curve.attack][level - 1] + (step.attack ?? 0);

        if (Math.abs(theirs.attack - ours) > 1e-6) {
          throw new Error(
            `${name} at ${level}/${phase}: base ATK is ${ours}, genshin-db says ${theirs.attack}`,
          );
        }
        checked += 1;
      }
    }
  }

  // --- talents -----------------------------------------------------------

  await rm(OUT_TALENTS, { recursive: true, force: true });
  await mkdir(OUT_TALENTS, { recursive: true });

  let hits = 0;
  const withoutTalents: string[] = [];

  for (const character of characters) {
    const talent = db.talents(character.talentName);
    const talents = talent ? parseTalents(talent) : {};

    if (Object.keys(talents).length === 0) {
      withoutTalents.push(character.key);
      continue;
    }

    for (const set of Object.values(talents)) hits += set.hits.length;
    await writeFile(
      path.join(OUT_TALENTS, `${character.key}.json`),
      `${JSON.stringify({ key: character.key, version: dbVersion, talents })}\n`,
      'utf8',
    );
  }

  // --- write -------------------------------------------------------------

  const source = `genshin-db ${dbVersion}, generated from the game's ExcelBinOutput`;

  await writeFile(
    OUT_CHARACTERS,
    [
      header(source),
      "import type { CharacterScaling } from '@/engine/stats/scaling';",
      '',
      '/** Shared growth curves. Index is level - 1, so these run 1 to 100. */',
      `export const CHARACTER_CURVES: Record<string, readonly number[]> = {`,
      ...Object.entries(characterCurves).map(([name, curve]) => `  ${name}: ${line(curve)},`),
      '};',
      '',
      'export type CharacterData = {',
      '  /** GOOD key, which is how a scanner export names this character. */',
      '  key: string;',
      '  name: string;',
      '  element: string | null;',
      '  weaponType: string;',
      '  rarity: 4 | 5;',
      '  base: { hp: number; atk: number; def: number };',
      '  /** Curve names, resolved through CHARACTER_CURVES. */',
      '  curve: { hp: string; atk: string; def: string };',
      '  /** The stat ascension grants: CRIT DMG, ATK%, Elemental Mastery. */',
      '  bonusStat: string;',
      '  ascension: { maxLevel: number; hp: number; atk: number; def: number; bonus: number }[];',
      '};',
      '',
      `export const CHARACTERS: Record<string, CharacterData> = {`,
      ...characters.map(({ key, record }) => `  ${JSON.stringify(key)}: ${record},`),
      '};',
      '',
      '/** Curve names swapped for the arrays themselves, ready for the engine. */',
      'export function characterScaling(data: CharacterData): CharacterScaling {',
      '  const curve = (name: string): readonly number[] => {',
      '    const found = CHARACTER_CURVES[name];',
      '    if (!found) throw new Error(`no growth curve named ${name}`);',
      '    return found;',
      '  };',
      '',
      '  return {',
      '    base: data.base,',
      '    curve: {',
      '      hp: curve(data.curve.hp),',
      '      atk: curve(data.curve.atk),',
      '      def: curve(data.curve.def),',
      '    },',
      '    ascension: data.ascension,',
      "    bonusStat: data.bonusStat as CharacterScaling['bonusStat'],",
      '  };',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    OUT_WEAPONS,
    [
      header(source),
      "import type { WeaponScaling } from '@/engine/stats/scaling';",
      '',
      '/** Shared growth curves. Index is level - 1, so these run 1 to 90. */',
      `export const WEAPON_CURVES: Record<string, readonly number[]> = {`,
      ...Object.entries(weaponCurves).map(([name, curve]) => `  ${name}: ${line(curve)},`),
      '};',
      '',
      'export type WeaponData = {',
      '  key: string;',
      '  name: string;',
      '  weaponType: string;',
      '  rarity: number;',
      '  base: { atk: number; substat: number };',
      '  curve: { atk: string; substat: string | null };',
      '  /** Null for the low-rarity weapons that carry no second stat. */',
      '  substatKey: string | null;',
      '  ascension: { maxLevel: number; atk: number }[];',
      '};',
      '',
      `export const WEAPONS: Record<string, WeaponData> = {`,
      ...weapons.map(({ key, record }) => `  ${JSON.stringify(key)}: ${record},`),
      '};',
      '',
      'export function weaponScaling(data: WeaponData): WeaponScaling {',
      '  const curve = (name: string | null): readonly number[] => {',
      '    const found = name ? WEAPON_CURVES[name] : undefined;',
      '    if (!found) throw new Error(`no growth curve named ${name}`);',
      '    return found;',
      '  };',
      '',
      '  return {',
      '    base: data.base,',
      '    curve: {',
      '      atk: curve(data.curve.atk),',
      '      // A weapon with no substat has no substat curve either; the engine',
      '      // never reads it, because substatKey is null.',
      '      substat: data.curve.substat ? curve(data.curve.substat) : [],',
      '    },',
      '    ascension: data.ascension,',
      "    substatKey: data.substatKey as WeaponScaling['substatKey'],",
      '  };',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`characters: ${characters.length}, weapons: ${weapons.length}, talent hits: ${hits}`);
  console.log(`cross-checked ${checked.toLocaleString('en-US')} character and weapon stat rows`);

  if (collisions.length > 0) {
    console.log(`same GOOD key as an earlier weapon, skipped: ${collisions.join(', ')}`);
  }

  if (withoutTalents.length > 0) {
    console.log(`no damage talents parsed for: ${withoutTalents.join(', ')}`);
  }
  if (elementless.length > 0) {
    console.log(`no element in the game data: ${elementless.join(', ')}`);
  }
  if (unlisted.length > 0) {
    console.log(
      `not in genshin-optimizer's key list yet (kept under the derived key): ${unlisted.join(', ')}`,
    );
  }
}

await main();
