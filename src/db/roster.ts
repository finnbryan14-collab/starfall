import type { ImportedCharacter, ImportedWeapon } from '@/lib/good';

import { db, type RosterRow, type WeaponRow } from './schema';

/**
 * The account's characters and weapons, as a scanner export saw them.
 *
 * Replaces rather than merges, for the same reason the artifact bag does: an
 * export is a photograph of the account at a moment, and merging two would
 * leave characters at levels they have long since passed.
 */

export async function replaceRoster(
  characters: readonly ImportedCharacter[],
  weapons: readonly ImportedWeapon[],
): Promise<void> {
  const now = Date.now();

  const characterRows: RosterRow[] = characters.map((character) => ({
    key: character.key,
    level: character.level,
    constellation: character.constellation,
    data: character,
    updatedAt: now,
  }));

  // A player can own several of the same weapon, so the key cannot be the id.
  const weaponRows: WeaponRow[] = weapons.map((weapon, index) => ({
    id: `${weapon.key}-${index}`,
    key: weapon.key,
    location: weapon.location,
    data: weapon,
    updatedAt: now,
  }));

  await db.transaction('rw', [db.roster, db.weapons], async () => {
    await db.roster.clear();
    await db.weapons.clear();
    if (characterRows.length > 0) await db.roster.bulkPut(characterRows);
    if (weaponRows.length > 0) await db.weapons.bulkPut(weaponRows);
  });
}

/** Every character, highest level first. */
export async function listRoster(): Promise<ImportedCharacter[]> {
  const rows = await db.roster.toArray();
  return rows
    .map((row) => row.data as ImportedCharacter)
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export async function listWeapons(): Promise<ImportedWeapon[]> {
  const rows = await db.weapons.toArray();
  return rows.map((row) => row.data as ImportedWeapon);
}

export async function rosterCount(): Promise<number> {
  return db.roster.count();
}
