'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import screen from '@/components/screen.module.css';
import { CHARACTERS } from '@/data/characters-generated';
import { listArtifacts } from '@/db/artifacts';
import { listRoster, listWeapons } from '@/db/roster';
import type { ImportedArtifact, ImportedCharacter } from '@/lib/good';
import { formatNumber } from '@/lib/format';
import {
  ARTIFACT_SORTS,
  CHARACTER_SORTS,
  WEAPON_SORTS,
  inventoryTotals,
  matchesArtifact,
  matchesCharacter,
  matchesWeapon,
  resolveWeapons,
  sortArtifacts,
  sortCharacters,
  characterName,
  setName,
  sortWeapons,
  weaponName,
  type ArtifactSort,
  type CharacterSort,
  type WeaponSort,
  type WeaponView,
} from '@/lib/inventory';
import { formatStat, formatStatValue, statName } from '@/lib/stats';
import { readOr } from '@/lib/storage';

import styles from './RosterScreen.module.css';

/**
 * Everything on the account: every character, every artifact, every weapon.
 *
 * Enka only ever returns the in-game showcase — eight characters and what they
 * are wearing — and no API exposes the artifact bag at all. A scanner export is
 * the only thing that sees the whole account, which is why this screen is empty
 * until one is imported and says so rather than looking broken.
 *
 * Weapons were imported and stored for weeks without appearing here, because a
 * GOOD export carries only a name and a level and there was nothing to judge
 * one by. `src/lib/inventory.ts` resolves them against the generated tables, so
 * a row can say 608 ATK and 66.2% CRIT DMG rather than just "Staff of Homa".
 */

type Tab = 'characters' | 'artifacts' | 'weapons';

const TABS: { key: Tab; label: string }[] = [
  { key: 'characters', label: 'Characters' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'weapons', label: 'Weapons' },
];

/*
  Short enough to survive 390px beside the sort control, where the longer
  versions were cut off mid-word. What each one searches is in the filter
  functions, which search more than the placeholder has room to list.
*/
const PLACEHOLDERS: Record<Tab, string> = {
  characters: 'Name or element',
  artifacts: 'Set, slot or stat',
  weapons: 'Name or type',
};

/** Rarity as stars, because rarity is never colour alone (DESIGN.md). */
function stars(rarity: number | null): string {
  return rarity === null ? '' : '★'.repeat(rarity);
}

export function RosterScreen() {
  const [characters, setCharacters] = useState<ImportedCharacter[]>([]);
  const [artifacts, setArtifacts] = useState<ImportedArtifact[]>([]);
  const [weapons, setWeapons] = useState<WeaponView[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState<Tab>('characters');
  const [filter, setFilter] = useState('');
  const [idleOnly, setIdleOnly] = useState(false);
  const [characterSort, setCharacterSort] = useState<CharacterSort>('level');
  const [artifactSort, setArtifactSort] = useState<ArtifactSort>('slot');
  const [weaponSort, setWeaponSort] = useState<WeaponSort>('rarity');

  useEffect(() => {
    let cancelled = false;
    void readOr(
      async () => [await listRoster(), await listArtifacts(), await listWeapons()] as const,
      [[], [], []] as const,
    ).then(([roster, bag, armoury]) => {
      if (cancelled) return;
      setCharacters(roster);
      setArtifacts(bag);
      setWeapons(resolveWeapons(armoury));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = filter.trim().toLowerCase();
  const totals = useMemo(
    () => inventoryTotals(characters, artifacts, weapons),
    [characters, artifacts, weapons],
  );

  const shownCharacters = useMemo(
    () =>
      sortCharacters(
        characters.filter((c) => matchesCharacter(c, needle)),
        characterSort,
      ),
    [characters, needle, characterSort],
  );

  const shownArtifacts = useMemo(
    () =>
      sortArtifacts(
        artifacts.filter((a) => matchesArtifact(a, needle) && (!idleOnly || !a.location)),
        artifactSort,
      ),
    [artifacts, needle, idleOnly, artifactSort],
  );

  const shownWeapons = useMemo(
    () =>
      sortWeapons(
        weapons.filter((w) => matchesWeapon(w, needle) && (!idleOnly || !w.location)),
        weaponSort,
      ),
    [weapons, needle, idleOnly, weaponSort],
  );

  const shownCount = {
    characters: shownCharacters,
    artifacts: shownArtifacts,
    weapons: shownWeapons,
  }[tab].length;

  const count: Record<Tab, number> = {
    characters: totals.characters,
    artifacts: totals.artifacts,
    weapons: totals.weapons,
  };

  const empty = loaded && totals.characters === 0 && totals.artifacts === 0 && totals.weapons === 0;

  return (
    <section className={screen.panel} aria-labelledby="roster-title" aria-busy={!loaded}>
      <div>
        <p>
          <Link href="/account" className={styles.back}>
            ← Account
          </Link>
        </p>

        <h1 className={screen.title} id="roster-title">
          Your account
        </h1>

        {empty ? (
          <p className={styles.empty}>
            Nothing imported yet. Enka only sends the eight characters in your showcase, and no API
            exposes the artifact bag at all — so the whole account comes from a scanner export.
            Account → <strong>Import inventory</strong>.
          </p>
        ) : (
          <>
            <p className={screen.body}>
              <strong>{formatNumber(totals.characters)}</strong>{' '}
              {totals.characters === 1 ? 'character' : 'characters'},{' '}
              <strong>{formatNumber(totals.artifacts)}</strong>{' '}
              {totals.artifacts === 1 ? 'artifact' : 'artifacts'} and{' '}
              <strong>{formatNumber(totals.weapons)}</strong>{' '}
              {totals.weapons === 1 ? 'weapon' : 'weapons'}, as your last scan saw them.
            </p>

            {/*
              What the account is actually doing, which is the question a list
              alone cannot answer: how much of it is sitting in the bag.
            */}
            <ul className={styles.summary}>
              <li className={styles.fact}>
                <span className={styles.factValue}>
                  {formatNumber(totals.equippedCharacters)}
                  <span className={styles.factOf}>/{formatNumber(totals.characters)}</span>
                </span>
                <span className={styles.factLabel}>fully equipped</span>
              </li>
              <li className={styles.fact}>
                <span className={styles.factValue}>{formatNumber(totals.idleArtifacts)}</span>
                <span className={styles.factLabel}>artifacts in the bag</span>
              </li>
              <li className={styles.fact}>
                <span className={styles.factValue}>{formatNumber(totals.idleWeapons)}</span>
                <span className={styles.factLabel}>weapons unheld</span>
              </li>
            </ul>
          </>
        )}
      </div>

      {!empty && loaded ? (
        <div className={screen.colSide}>
          <div className={styles.tabs} role="tablist" aria-label="What to show">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={styles.tab}
                onClick={() => setTab(key)}
              >
                {label} ({formatNumber(count[key])})
              </button>
            ))}
          </div>

          <div className={styles.controls}>
            <label className="sr-only" htmlFor="roster-filter">
              Filter
            </label>
            <input
              id="roster-filter"
              className={styles.filter}
              type="search"
              autoComplete="off"
              placeholder={PLACEHOLDERS[tab]}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />

            <label className={styles.sortLabel} htmlFor="roster-sort">
              Sort
            </label>
            {tab === 'characters' ? (
              <select
                id="roster-sort"
                className={styles.select}
                value={characterSort}
                onChange={(event) => setCharacterSort(event.target.value as CharacterSort)}
              >
                {CHARACTER_SORTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : tab === 'artifacts' ? (
              <select
                id="roster-sort"
                className={styles.select}
                value={artifactSort}
                onChange={(event) => setArtifactSort(event.target.value as ArtifactSort)}
              >
                {ARTIFACT_SORTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="roster-sort"
                className={styles.select}
                value={weaponSort}
                onChange={(event) => setWeaponSort(event.target.value as WeaponSort)}
              >
                {WEAPON_SORTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/*
            Only on the two tabs that can be idle. A character is never "in the
            bag", so offering the toggle there would be a control that does
            nothing.
          */}
          {tab === 'characters' ? null : (
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={idleOnly}
                onChange={(event) => setIdleOnly(event.target.checked)}
              />
              Only what nobody is using
            </label>
          )}

          {tab === 'characters' ? (
            <ul className={styles.list} aria-label="Every character on the account">
              {shownCharacters.map((character) => {
                const data = CHARACTERS[character.key];
                return (
                  <li className={styles.row} key={character.key}>
                    <span className={styles.name}>
                      {/*
                        The table's own name where there is one: `readableKey`
                        splits on capitals, which turns TravelerPyro into
                        "Traveler Pyro" rather than "Traveler (Pyro)".
                      */}
                      {data?.name ?? character.name}
                      {character.constellation > 0 ? (
                        <span className={styles.con}> C{character.constellation}</span>
                      ) : null}
                    </span>
                    <span className={styles.meta}>Lv {character.level}</span>
                    <span className={styles.sub}>
                      {data ? (
                        <>
                          <span className={styles.stars}>{stars(data.rarity)}</span>{' '}
                          {data.element ? `${data.element} ` : ''}
                          {data.weaponType} ·{' '}
                        </>
                      ) : null}
                      {/*
                        Talent levels are the reason this screen exists at all:
                        no API carries them, and a damage number is wrong without.
                      */}
                      Talents {character.talent.auto}/{character.talent.skill}/
                      {character.talent.burst}
                      {character.weapon
                        ? ` · ${weaponName(character.weapon.key, character.weapon.name)} R${character.weapon.refinement}`
                        : ' · no weapon'}
                      {` · ${character.artifactCount}/5 artifacts`}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : tab === 'artifacts' ? (
            <ul className={styles.list} aria-label="Every artifact in the bag">
              {shownArtifacts.map((artifact) => (
                <li className={styles.row} key={artifact.id}>
                  <span className={styles.name}>{setName(artifact.setKey)}</span>
                  <span className={styles.meta}>+{artifact.level}</span>
                  <span className={styles.sub}>
                    <span className={styles.stars}>{stars(artifact.rarity)}</span>{' '}
                    {artifact.slotKey} · {statName(artifact.mainStat)}
                    {artifact.location
                      ? ` · on ${characterName(artifact.location)}`
                      : ' · unequipped'}
                  </span>
                  <span className={styles.subs}>
                    {Object.entries(artifact.substats)
                      .map(([key, value]) => formatStat(key, value))
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={styles.list} aria-label="Every weapon on the account">
              {shownWeapons.map((weapon) => (
                <li className={styles.row} key={weapon.id}>
                  <span className={styles.name}>
                    {weapon.name}
                    {weapon.refinement > 1 ? (
                      <span className={styles.con}> R{weapon.refinement}</span>
                    ) : null}
                  </span>
                  <span className={styles.meta}>Lv {weapon.level}</span>
                  <span className={styles.sub}>
                    <span className={styles.stars}>{stars(weapon.rarity)}</span>{' '}
                    {weapon.weaponType ?? 'unknown weapon'}
                    {weapon.location ? ` · on ${characterName(weapon.location)}` : ' · in the bag'}
                  </span>
                  <span className={styles.subs}>
                    {weapon.atk === null ? (
                      /*
                        A weapon from a patch newer than the last build:data.
                        Said plainly, because a blank row looks like a bug.
                      */
                      <>Not in Starfall&rsquo;s tables yet — run a data rebuild.</>
                    ) : (
                      <>
                        {formatStatValue('atk', weapon.atk)} base ATK
                        {weapon.substatKey && weapon.substatValue !== null
                          ? ` · ${formatStat(weapon.substatKey, weapon.substatValue)}`
                          : ''}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {shownCount === 0 ? (
            <p className={styles.empty}>
              {needle ? <>Nothing matches “{filter}”.</> : <>Everything here is in use.</>}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
