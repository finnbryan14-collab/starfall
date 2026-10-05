import { describe, expect, it } from 'vitest';

import { ARTIFACT_SETS } from '@/data/artifact-sets-generated';
import { CHARACTERS } from '@/data/characters-generated';
import { WEAPONS } from '@/data/weapons-generated';
import type { ImportedArtifact, ImportedCharacter, ImportedWeapon } from '@/lib/good';

import {
  ARTIFACT_SORTS,
  CHARACTER_SORTS,
  characterName,
  WEAPON_SORTS,
  inventoryTotals,
  matchesArtifact,
  matchesCharacter,
  matchesWeapon,
  resolveWeapon,
  resolveWeapons,
  sortArtifacts,
  sortCharacters,
  setName,
  sortWeapons,
  weaponName,
} from './inventory';

function weapon(over: Partial<ImportedWeapon> = {}): ImportedWeapon {
  return {
    key: 'StaffOfHoma',
    name: 'Staff of Homa',
    level: 90,
    ascension: 6,
    refinement: 1,
    location: '',
    ...over,
  };
}

function character(over: Partial<ImportedCharacter> = {}): ImportedCharacter {
  return {
    key: 'HuTao',
    name: 'Hu Tao',
    level: 90,
    ascension: 6,
    constellation: 0,
    talent: { auto: 10, skill: 10, burst: 10 },
    weapon: null,
    artifactCount: 5,
    ...over,
  };
}

function artifact(over: Partial<ImportedArtifact> = {}): ImportedArtifact {
  return {
    id: 'good-0',
    setKey: 'CrimsonWitchOfFlames',
    slotKey: 'goblet',
    location: '',
    rarity: 5,
    level: 20,
    mainStat: 'pyro_dmg',
    substats: { cr: 3.9, cd: 21.8 },
    lock: false,
    ...over,
  };
}

describe('resolveWeapon', () => {
  /**
   * Wiki, Staff of Homa, row 90/90: 608 ATK, 66.2% CRIT DMG. The same figures
   * the scaling tests cite, checked again here because this is the layer the
   * roster screen reads and a units slip would be invisible in the engine.
   *
   *   source: https://genshin-impact.fandom.com/wiki/Staff_of_Homa
   *   verifiedAt: 2026-09-30
   */
  it('reads a weapon at its own level off the generated tables', () => {
    const view = resolveWeapon(weapon());

    expect(view.rarity).toBe(5);
    expect(view.weaponType).toBe('polearm');
    expect(view.atk).toBeCloseTo(608, 0);
    expect(view.substatKey).toBe('cd');
    // Points, not a fraction — the units every screen formats in.
    expect(view.substatValue).toBeCloseTo(66.2, 1);
  });

  it('carries the same two numbers in engine units for the search to use', () => {
    const view = resolveWeapon(weapon());

    // Fractions here, points above. The build search takes this map directly,
    // so a factor of 100 between the two would be a silent 100× on a damage
    // figure rather than a visible one.
    expect(view.stats?.atk).toBeCloseTo(608, 0);
    expect(view.stats?.cd).toBeCloseTo(0.662, 3);
    expect(view.substatValue).toBeCloseTo((view.stats!.cd as number) * 100, 6);
  });

  it('names a weapon the way the game does, not the way the key splits', () => {
    /*
      `readableKey` splits on capitals and cannot put back punctuation it never
      saw. 95 of the 253 weapons in the tables came out wrong that way —
      "Amos Bow" for Amos' Bow, and "ATeaspoon Of Transcendence" for A Teaspoon
      of Transcendence.
    */
    expect(resolveWeapon(weapon({ key: 'DragonsBane', name: 'Dragons Bane' })).name).toBe(
      "Dragon's Bane",
    );

    const mangled = Object.values(WEAPONS).filter(
      (data) => resolveWeapon(weapon({ key: data.key })).name !== data.name,
    );
    expect(mangled).toEqual([]);
  });

  it('keeps an unknown weapon rather than dropping it', () => {
    // A scanner can name a weapon from a patch newer than the last build:data.
    const view = resolveWeapon(weapon({ key: 'SwordOfNextPatch', name: 'Sword Of Next Patch' }));

    expect(view.name).toBe('Sword Of Next Patch');
    expect(view.rarity).toBeNull();
    expect(view.atk).toBeNull();
    expect(view.substatKey).toBeNull();
  });

  it('clamps a level past the weapon’s own cap instead of throwing', () => {
    /*
      weaponBaseStats throws a RangeError above the cap, and the caps are not
      all 90 — a 1★ and 2★ weapon stops at 70. A scanner reporting a level
      above the cap must not take the whole screen down with it.
    */
    const lowRarity = Object.values(WEAPONS).find((data) => data.rarity <= 2);
    expect(lowRarity).toBeDefined();

    const cap = lowRarity!.ascension[lowRarity!.ascension.length - 1].maxLevel;
    expect(cap).toBeLessThan(90);

    const view = resolveWeapon(weapon({ key: lowRarity!.key, level: 90 }));
    expect(view.level).toBe(cap);
    expect(view.atk).not.toBeNull();
  });

  it('carries no second stat for a weapon that has none', () => {
    const plain = Object.values(WEAPONS).find((data) => data.substatKey === null);
    expect(plain).toBeDefined();

    const view = resolveWeapon(weapon({ key: plain!.key, level: 1 }));
    expect(view.substatKey).toBeNull();
    expect(view.substatValue).toBeNull();
    expect(view.atk).not.toBeNull();
  });

  it('gives every copy of the same weapon its own id', () => {
    // A player can own four Favonius Lances; the list has to tell them apart.
    const views = resolveWeapons([weapon(), weapon(), weapon()]);
    expect(new Set(views.map((view) => view.id)).size).toBe(3);
  });
});

describe('names', () => {
  /*
    Three datasets, one bug: `readableKey` splits a GOOD key on capitals and
    cannot put back punctuation it never saw. Every generated table carries the
    game's own spelling, so nothing has to be guessed — it just has to be read.
  */
  it('spells an artifact set the way the game does', () => {
    expect(setName('GladiatorsFinale')).toBe("Gladiator's Finale");
    expect(setName('CrimsonWitchOfFlames')).toBe('Crimson Witch of Flames');

    const mangled = Object.values(ARTIFACT_SETS).filter((set) => setName(set.key) !== set.name);
    expect(mangled).toEqual([]);
  });

  it('spells a character the way the game does', () => {
    // The seven Travelers are the only ones the split gets wrong, and it gets
    // every one of them wrong.
    expect(characterName('TravelerPyro')).toBe('Traveler (Pyro)');
    expect(characterName('HuTao')).toBe('Hu Tao');

    const mangled = Object.values(CHARACTERS).filter(
      (entry) => characterName(entry.key) !== entry.name,
    );
    expect(mangled).toEqual([]);
  });

  it('falls back to the split key for something it has never heard of', () => {
    // A rough name beats no name when a scanner reports a patch we lack.
    expect(setName('SetOfNextPatch')).toBe('Set Of Next Patch');
    expect(characterName('CharacterOfNextPatch')).toBe('Character Of Next Patch');
    expect(weaponName('WeaponOfNextPatch', 'Weapon Of Next Patch')).toBe('Weapon Of Next Patch');
    // Nobody holding it is the caller's sentence to write, not this one's.
    expect(characterName('')).toBe('');
  });

  it('finds a piece by the name the player would type', () => {
    const piece = artifact({ setKey: 'GladiatorsFinale', location: 'TravelerPyro' });

    expect(matchesArtifact(piece, "gladiator's finale")).toBe(true);
    // Nobody reaches for the apostrophe key halfway through filtering a bag.
    expect(matchesArtifact(piece, 'gladiators')).toBe(true);
    expect(matchesArtifact(piece, 'traveler (pyro)')).toBe(true);
    expect(matchesArtifact(piece, 'traveler')).toBe(true);

    expect(matchesWeapon(resolveWeapon(weapon({ key: 'AmosBow' })), "amos' bow")).toBe(true);
    expect(matchesWeapon(resolveWeapon(weapon({ key: 'AmosBow' })), 'amos bow')).toBe(true);
  });

  it('finds a character by the weapon they are holding, spelled either way', () => {
    const holder = character({
      key: 'Ganyu',
      name: 'Ganyu',
      weapon: weapon({ key: 'AmosBow', name: 'Amos Bow', location: 'Ganyu' }),
    });

    expect(matchesCharacter(holder, "amos' bow")).toBe(true);
    expect(matchesCharacter(holder, 'amos bow')).toBe(true);
  });
});

describe('sorting', () => {
  it('orders characters by every offered key', () => {
    const roster = [
      character({ key: 'Amber', name: 'Amber', level: 20, constellation: 6 }),
      character({ key: 'HuTao', name: 'Hu Tao', level: 90 }),
      character({ key: 'Zhongli', name: 'Zhongli', level: 80 }),
    ];

    expect(sortCharacters(roster, 'level').map((entry) => entry.name)).toEqual([
      'Hu Tao',
      'Zhongli',
      'Amber',
    ]);
    expect(sortCharacters(roster, 'name').map((entry) => entry.name)).toEqual([
      'Amber',
      'Hu Tao',
      'Zhongli',
    ]);
    // Hu Tao and Zhongli are 5★, Amber is 4★.
    expect(sortCharacters(roster, 'rarity').map((entry) => entry.name)[2]).toBe('Amber');
    // Geo before pyro, and the two pyro characters by level inside their group.
    expect(sortCharacters(roster, 'element').map((entry) => entry.name)).toEqual([
      'Zhongli',
      'Hu Tao',
      'Amber',
    ]);
  });

  it('sorts a character the data has never heard of last, not first', () => {
    const roster = [
      character({ key: 'CharacterOfNextPatch', name: 'Next Patch', level: 90 }),
      character({ key: 'Zhongli', name: 'Zhongli', level: 1 }),
    ];
    // A blank element is not a category, so it sorts after every real one.
    expect(sortCharacters(roster, 'element').map((entry) => entry.name)).toEqual([
      'Zhongli',
      'Next Patch',
    ]);
    expect(sortCharacters(roster, 'rarity').map((entry) => entry.name)).toEqual([
      'Zhongli',
      'Next Patch',
    ]);
  });

  it('orders weapons by every offered key', () => {
    const bag = resolveWeapons([
      weapon({ key: 'FavoniusLance', name: 'Favonius Lance', level: 90 }),
      weapon({ key: 'StaffOfHoma', name: 'Staff of Homa', level: 90 }),
      weapon({ key: 'DullBlade', name: 'Dull Blade', level: 1 }),
    ]);

    expect(sortWeapons(bag, 'rarity')[0].name).toBe('Staff of Homa');
    expect(sortWeapons(bag, 'atk')[0].name).toBe('Staff of Homa');
    expect(sortWeapons(bag, 'name').map((entry) => entry.name)).toEqual([
      'Dull Blade',
      'Favonius Lance',
      'Staff of Homa',
    ]);
    expect(sortWeapons(bag, 'level')[0].level).toBe(90);
    // Bow, catalyst, claymore, polearm, sword: all three are polearms or
    // swords, so type must group rather than interleave.
    expect(sortWeapons(bag, 'type').map((entry) => entry.weaponType)).toEqual([
      'polearm',
      'polearm',
      'sword',
    ]);
  });

  it('sorts a weapon the tables have never heard of last, not first', () => {
    /*
      An unknown type has no name to compare, and the obvious fix — sorting a
      high sentinel string — is wrong: collation puts punctuation before
      letters, so '~' would head the list rather than tail it.
    */
    const bag = resolveWeapons([
      weapon({ key: 'WeaponOfNextPatch', name: 'Next Patch' }),
      weapon({ key: 'StaffOfHoma', name: 'Staff of Homa' }),
    ]);

    expect(sortWeapons(bag, 'type').map((entry) => entry.name)).toEqual([
      'Staff of Homa',
      'Next Patch',
    ]);
    expect(sortWeapons(bag, 'rarity').map((entry) => entry.name)).toEqual([
      'Staff of Homa',
      'Next Patch',
    ]);
    expect(sortWeapons(bag, 'atk').map((entry) => entry.name)).toEqual([
      'Staff of Homa',
      'Next Patch',
    ]);
  });

  it('orders artifacts by every offered key', () => {
    const bag = [
      artifact({ id: 'a', slotKey: 'circlet', level: 0, substats: { cr: 3.1 } }),
      artifact({ id: 'b', slotKey: 'flower', level: 20, substats: { cr: 7.8, cd: 14 } }),
      artifact({ id: 'c', slotKey: 'sands', level: 16, substats: {} }),
    ];

    expect(sortArtifacts(bag, 'slot').map((entry) => entry.slotKey)).toEqual([
      'flower',
      'sands',
      'circlet',
    ]);
    expect(sortArtifacts(bag, 'level')[0].level).toBe(20);
    // 7.8 × 2 + 14 = 29.6 beats 3.1 × 2 = 6.2 beats nothing.
    expect(sortArtifacts(bag, 'critValue').map((entry) => entry.id)).toEqual(['b', 'a', 'c']);
  });

  it('breaks ties the same way every time', () => {
    /*
      Array.prototype.sort is stable, but the input is not: a filter box
      re-derives the list on every keystroke. A comparator that returns 0 for
      two different pieces lets them swap places as the player types, which
      reads as the list flickering.
    */
    const bag = [
      artifact({ id: 'good-2', setKey: 'Bolide', level: 20 }),
      artifact({ id: 'good-0', setKey: 'Bolide', level: 20 }),
      artifact({ id: 'good-1', setKey: 'Bolide', level: 20 }),
    ];

    for (const key of ARTIFACT_SORTS) {
      const once = sortArtifacts(bag, key.key).map((entry) => entry.id);
      const twice = sortArtifacts([...bag].reverse(), key.key).map((entry) => entry.id);
      expect(twice, `sort by ${key.key} depends on input order`).toEqual(once);
    }
  });

  it('breaks weapon and character ties the same way every time', () => {
    const bag = resolveWeapons([weapon(), weapon(), weapon()]);
    for (const key of WEAPON_SORTS) {
      const once = sortWeapons(bag, key.key).map((entry) => entry.id);
      const twice = sortWeapons([...bag].reverse(), key.key).map((entry) => entry.id);
      expect(twice, `sort by ${key.key} depends on input order`).toEqual(once);
    }

    const roster = [
      character({ key: 'A', name: 'A' }),
      character({ key: 'B', name: 'B' }),
      character({ key: 'C', name: 'C' }),
    ];
    for (const key of CHARACTER_SORTS) {
      const once = sortCharacters(roster, key.key).map((entry) => entry.key);
      const twice = sortCharacters([...roster].reverse(), key.key).map((entry) => entry.key);
      expect(twice, `sort by ${key.key} depends on input order`).toEqual(once);
    }
  });

  it('does not touch the array it was given', () => {
    const bag = [artifact({ id: 'a', level: 0 }), artifact({ id: 'b', level: 20 })];
    sortArtifacts(bag, 'level');
    expect(bag.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('filtering', () => {
  it('matches a character on name and on what they hold', () => {
    const hutao = character({ weapon: weapon({ location: 'HuTao' }) });

    expect(matchesCharacter(hutao, 'hu ta')).toBe(true);
    expect(matchesCharacter(hutao, 'homa')).toBe(true);
    expect(matchesCharacter(hutao, 'zhongli')).toBe(false);
    // An empty needle is not a filter.
    expect(matchesCharacter(hutao, '')).toBe(true);
  });

  it('matches a weapon on name, type and holder', () => {
    const held = resolveWeapon(weapon({ location: 'HuTao' }));

    expect(matchesWeapon(held, 'homa')).toBe(true);
    expect(matchesWeapon(held, 'polearm')).toBe(true);
    // The holder is stored as a GOOD key, and nobody types PascalCase.
    expect(matchesWeapon(held, 'hu tao')).toBe(true);
    expect(matchesWeapon(held, 'bow')).toBe(false);
  });

  it('matches an artifact on set, slot, wearer and stat', () => {
    const piece = artifact({ location: 'HuTao' });

    expect(matchesArtifact(piece, 'crimson')).toBe(true);
    expect(matchesArtifact(piece, 'goblet')).toBe(true);
    expect(matchesArtifact(piece, 'hu tao')).toBe(true);
    // Searching by the stat you need is the whole point of a bag this size.
    expect(matchesArtifact(piece, 'pyro')).toBe(true);
    expect(matchesArtifact(piece, 'crit dmg')).toBe(true);
    expect(matchesArtifact(piece, 'anemo')).toBe(false);
  });
});

describe('inventoryTotals', () => {
  it('counts what is in use and what is idle', () => {
    const totals = inventoryTotals(
      [character({ key: 'HuTao', artifactCount: 5, weapon: weapon({ location: 'HuTao' }) })],
      [artifact({ id: 'a', location: 'HuTao' }), artifact({ id: 'b', location: '' })],
      resolveWeapons([weapon({ location: 'HuTao' }), weapon({ location: '' })]),
    );

    expect(totals.characters).toBe(1);
    expect(totals.artifacts).toBe(2);
    expect(totals.weapons).toBe(2);
    expect(totals.idleArtifacts).toBe(1);
    expect(totals.idleWeapons).toBe(1);
    // Five artifacts and a weapon is a finished character.
    expect(totals.equippedCharacters).toBe(1);
  });

  it('does not count a half-dressed character as equipped', () => {
    const totals = inventoryTotals(
      [character({ artifactCount: 4, weapon: weapon({ location: 'HuTao' }) })],
      [],
      [],
    );
    expect(totals.equippedCharacters).toBe(0);
  });
});
