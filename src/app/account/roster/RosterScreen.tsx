'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import screen from '@/components/screen.module.css';
import { listArtifacts } from '@/db/artifacts';
import { SLOT_ORDER } from '@/engine/artifacts/model';
import { listRoster } from '@/db/roster';
import type { ImportedArtifact, ImportedCharacter } from '@/lib/good';
import { readableKey } from '@/lib/good';
import { formatNumber } from '@/lib/format';
import { readOr } from '@/lib/storage';

import styles from './RosterScreen.module.css';

/**
 * Everything on the account: every character, and every artifact in the bag.
 *
 * Enka only ever returns the in-game showcase — eight characters and what they
 * are wearing — and no API exposes the artifact bag at all. A scanner export is
 * the only thing that sees the whole account, which is why this screen is empty
 * until one is imported and says so rather than looking broken.
 */

type Tab = 'characters' | 'artifacts';

export function RosterScreen() {
  const [characters, setCharacters] = useState<ImportedCharacter[]>([]);
  const [artifacts, setArtifacts] = useState<ImportedArtifact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('characters');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    void readOr(
      async (): Promise<[ImportedCharacter[], ImportedArtifact[]]> => [
        await listRoster(),
        await listArtifacts(),
      ],
      [[], []] as [ImportedCharacter[], ImportedArtifact[]],
    ).then(([roster, bag]) => {
      if (cancelled) return;
      setCharacters(roster);
      setArtifacts(bag);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = filter.trim().toLowerCase();

  const shownCharacters = useMemo(
    () =>
      needle
        ? characters.filter(
            (c) =>
              c.name.toLowerCase().includes(needle) ||
              (c.weapon?.name ?? '').toLowerCase().includes(needle),
          )
        : characters,
    [characters, needle],
  );

  const shownArtifacts = useMemo(() => {
    const matched = needle
      ? artifacts.filter(
          (a) =>
            readableKey(a.setKey).toLowerCase().includes(needle) ||
            a.location.toLowerCase().includes(needle) ||
            a.slotKey.includes(needle),
        )
      : artifacts;

    // Slot order first, then the best-levelled pieces, which is how a player
    // reads their own bag.
    return [...matched].sort(
      (a, b) =>
        SLOT_ORDER.indexOf(a.slotKey) - SLOT_ORDER.indexOf(b.slotKey) ||
        b.level - a.level ||
        readableKey(a.setKey).localeCompare(readableKey(b.setKey)),
    );
  }, [artifacts, needle]);

  const empty = loaded && characters.length === 0 && artifacts.length === 0;

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
          <p className={screen.body}>
            <strong>{formatNumber(characters.length)}</strong>{' '}
            {characters.length === 1 ? 'character' : 'characters'} and{' '}
            <strong>{formatNumber(artifacts.length)}</strong>{' '}
            {artifacts.length === 1 ? 'artifact' : 'artifacts'}, as your last scan saw them.
          </p>
        )}
      </div>

      {!empty && loaded ? (
        <div className={screen.colSide}>
          <div className={styles.tabs} role="tablist" aria-label="What to show">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'characters'}
              className={styles.tab}
              onClick={() => setTab('characters')}
            >
              Characters ({formatNumber(characters.length)})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'artifacts'}
              className={styles.tab}
              onClick={() => setTab('artifacts')}
            >
              Artifacts ({formatNumber(artifacts.length)})
            </button>
          </div>

          <label className="sr-only" htmlFor="roster-filter">
            Filter
          </label>
          <input
            id="roster-filter"
            className={styles.filter}
            type="search"
            autoComplete="off"
            placeholder={tab === 'characters' ? 'Find a character' : 'Find a set, slot or wearer'}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />

          {tab === 'characters' ? (
            <ul className={styles.list} aria-label="Every character on the account">
              {shownCharacters.map((character) => (
                <li className={styles.row} key={character.key}>
                  <span className={styles.name}>
                    {character.name}
                    {character.constellation > 0 ? (
                      <span className={styles.con}> C{character.constellation}</span>
                    ) : null}
                  </span>
                  <span className={styles.meta}>Lv {character.level}</span>
                  <span className={styles.sub}>
                    {/*
                      Talent levels are the reason this screen exists at all:
                      no API carries them, and a damage number is wrong without.
                    */}
                    Talents {character.talent.auto}/{character.talent.skill}/
                    {character.talent.burst}
                    {character.weapon
                      ? ` · ${character.weapon.name} R${character.weapon.refinement}`
                      : ' · no weapon'}
                    {character.artifactCount > 0 ? ` · ${character.artifactCount}/5 artifacts` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={styles.list} aria-label="Every artifact in the bag">
              {shownArtifacts.map((artifact) => (
                <li className={styles.row} key={artifact.id}>
                  <span className={styles.name}>{readableKey(artifact.setKey)}</span>
                  <span className={styles.meta}>+{artifact.level}</span>
                  <span className={styles.sub}>
                    {artifact.slotKey} · {artifact.mainStat}
                    {artifact.location
                      ? ` · on ${readableKey(artifact.location)}`
                      : ' · unequipped'}
                  </span>
                  <span className={styles.subs}>
                    {Object.entries(artifact.substats)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {(tab === 'characters' ? shownCharacters : shownArtifacts).length === 0 ? (
            <p className={styles.empty}>Nothing matches “{filter}”.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
