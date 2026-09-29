'use client';

import { useMemo, useState } from 'react';

import screen from '@/components/screen.module.css';
import { characterIconUrl, lookupCharacter } from '@/data/enka-map';
import { ENKA_FAILURE_COPY, hasShowcase } from '@/lib/enka';

import styles from './AccountScreen.module.css';
import { useEnkaProfile } from './useEnkaProfile';
import { WishImport } from './WishImport';

/**
 * Bringing an account in, and saying plainly what is stored and where.
 *
 * Everything here is local. The only thing that leaves the device is the UID,
 * to our own proxy, and later the one wish-history request (docs/DATA.md).
 */

type ShowcaseCharacter = {
  avatarId: number;
  level: number | null;
  constellation: number;
};

/** Reads the parts of Enka's response the chips need, defensively. */
function readShowcase(data: unknown): ShowcaseCharacter[] {
  if (typeof data !== 'object' || data === null) return [];
  const list = (data as { avatarInfoList?: unknown }).avatarInfoList;
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry): ShowcaseCharacter[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as {
      avatarId?: unknown;
      propMap?: Record<string, { val?: string }>;
      talentIdList?: unknown[];
    };
    if (typeof record.avatarId !== 'number') return [];

    // Level lives in propMap under key 4001, as a string.
    const rawLevel = record.propMap?.['4001']?.val;
    const level = rawLevel ? Number(rawLevel) : null;

    return [
      {
        avatarId: record.avatarId,
        level: Number.isFinite(level) ? level : null,
        // An unlocked constellation per entry in talentIdList.
        constellation: Array.isArray(record.talentIdList) ? record.talentIdList.length : 0,
      },
    ];
  });
}

function playerName(data: unknown): string | null {
  const info = (data as { playerInfo?: { nickname?: string } } | null)?.playerInfo;
  return info?.nickname ?? null;
}

export function AccountScreen() {
  const { profile, loaded, importing, failure, cooldownMs, age, importUid, forget } =
    useEnkaProfile();
  const [uid, setUid] = useState('');

  const characters = useMemo(() => readShowcase(profile?.data), [profile]);
  const nickname = profile ? playerName(profile.data) : null;
  const showcaseEmpty = profile !== null && !hasShowcase(profile.data);
  const cooldownSeconds = Math.ceil(cooldownMs / 1000);

  // The UID the button would submit. Refreshing the one already loaded is
  // blocked during Enka's TTL, but typing a different UID is always allowed —
  // that is a separate cache entry, not a repeat request.
  const targetUid = uid.trim() || profile?.uid || '';
  const refreshingSameUid = profile !== null && targetUid === profile.uid;

  return (
    <section className={screen.panel} aria-labelledby="acc-title">
      <div>
        <h1 className={screen.title} id="acc-title">
          Account
        </h1>
        <p className={screen.body}>
          Bring in your characters and wish history so the planner fills itself in. Everything stays
          on this device.
        </p>

        <h2 className={screen.sec}>Characters</h2>

        <form
          className={styles.field}
          onSubmit={(event) => {
            event.preventDefault();
            void importUid(uid || (profile?.uid ?? ''));
          }}
        >
          <label className="sr-only" htmlFor="uid">
            UID
          </label>
          <input
            id="uid"
            className={styles.input}
            inputMode="numeric"
            autoComplete="off"
            placeholder={profile?.uid ?? 'Your 9- or 10-digit UID'}
            value={uid}
            onChange={(event) => setUid(event.target.value)}
          />
          <button
            type="submit"
            className={styles.primary}
            disabled={importing || (refreshingSameUid && cooldownMs > 0)}
          >
            {importing ? 'Importing…' : profile ? 'Refresh' : 'Import characters'}
          </button>
        </form>

        {failure ? (
          <p className={styles.failure} role="alert">
            {ENKA_FAILURE_COPY[failure]}
          </p>
        ) : null}

        {showcaseEmpty && !failure ? (
          <p className={styles.failure} role="alert">
            {ENKA_FAILURE_COPY['no-showcase']}
          </p>
        ) : null}

        {profile && cooldownMs > 0 ? (
          <p className={styles.note}>
            Updated {age}. Enka refreshes this every {profile.ttlSeconds} seconds — you can check
            again in {cooldownSeconds} {cooldownSeconds === 1 ? 'second' : 'seconds'}.
          </p>
        ) : profile ? (
          <p className={styles.note}>Updated {age}. Refresh whenever you like.</p>
        ) : (
          <p className={screen.body}>
            Only characters in your in-game showcase come through. Turn the showcase on in your
            profile first.
          </p>
        )}

        {characters.length > 0 ? (
          <>
            <ul className={styles.chips} aria-label="Characters in your showcase">
              {characters.map((character) => {
                const info = lookupCharacter(character.avatarId);
                return (
                  <li key={character.avatarId} className={styles.chip}>
                    {info ? (
                      /*
                        Plain <img> on purpose. These are 40px avatars from
                        Enka's CDN, which DATA.md says to use directly; routing
                        them through next/image would add a remotePatterns
                        entry, a hop through our own server and per-image cost,
                        to optimise something already tiny.
                      */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={styles.portrait}
                        src={characterIconUrl(info.icon)}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                      />
                    ) : (
                      <span className={styles.portrait} aria-hidden="true" />
                    )}
                    <span className={styles.chipText}>
                      <span className={styles.chipName}>
                        {info?.name ?? `Character ${character.avatarId}`}
                      </span>
                      <span className={styles.chipMeta}>
                        {/* Rarity is never colour alone (DESIGN.md). */}
                        {info ? `${'★'.repeat(info.rarity)} ` : ''}
                        {character.level ? `Lv ${character.level}` : ''}
                        {character.constellation > 0 ? ` · C${character.constellation}` : ''}
                      </span>
                    </span>
                    {info?.element ? (
                      <span
                        className={styles.element}
                        style={{ background: `var(--${info.element})` }}
                        aria-label={info.element}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {nickname ? (
              <p className={styles.note}>
                Showing {characters.length} from {nickname}&rsquo;s showcase.
              </p>
            ) : null}
          </>
        ) : null}

        {profile ? (
          <div className={screen.actions}>
            <button type="button" className={styles.quiet} onClick={() => void forget()}>
              Forget this UID
            </button>
          </div>
        ) : null}

        {!loaded ? <p className={screen.body}>Checking what you have saved…</p> : null}
      </div>

      <div className={screen.colSide}>
        <WishImport />

        <h2 className={screen.sec}>Backups</h2>
        <p className={screen.body}>
          Export everything as one JSON file, or bring a backup back in.
        </p>

        <p className={screen.notice}>
          Starfall is a fan project and is not affiliated with HoYoverse. Game content and materials
          are trademarks and copyrights of HoYoverse.
        </p>
      </div>
    </section>
  );
}
