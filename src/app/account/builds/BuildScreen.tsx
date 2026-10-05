'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import screen from '@/components/screen.module.css';
import { AnswerBlock, SegmentedControl, StepperRow } from '@/components/ui';
import { ARTIFACT_SETS } from '@/data/artifact-sets-generated';
import {
  activeSets,
  equipAll,
  resolveSetBonuses,
  searchSets,
  type UnmodelledBonus,
} from '@/data/build';
import { CHARACTERS, characterScaling } from '@/data/characters-generated';
import {
  TALENT_GROUP_LABELS,
  TALENT_LEVEL_KEYS,
  loadTalents,
  talentOptions,
  type TalentOption,
} from '@/data/talents';
import { WEAPONS, weaponScaling } from '@/data/weapons-generated';
import { listArtifacts } from '@/db/artifacts';
import { listRoster } from '@/db/roster';
import { amplifyingFor } from '@/engine/damage/formula';
import { fireBurst } from '@/lib/moments';
import type { SearchInput } from '@/engine/damage/search';
import { characterBaseStats, weaponBaseStats, type StatMap } from '@/engine/stats/scaling';
import { formatNumber } from '@/lib/format';
import { useTweenedNumeral } from '@/motion';
import type { ImportedArtifact, ImportedCharacter } from '@/lib/good';
import { readableKey } from '@/lib/good';
import { formatStat, formatStatValue, statName } from '@/lib/stats';
import { readOr } from '@/lib/storage';
import { useBuildSearch } from '@/workers/useBuildSearch';

import styles from './BuildScreen.module.css';

/**
 * The best five artifacts in the bag, for one hit of one character.
 *
 * The search runs in a worker (see useBuildSearch); this chooses what to search
 * for and shows what came back. Everything it needs comes from the player's own
 * scanner export — the artifacts, the character's level, and the talent levels
 * no API exposes.
 *
 * What it will not do is guess. A team buff, a weapon passive or a 4-piece set
 * bonus is a number the player types or a box they tick, never something
 * Starfall infers from a team it cannot see (docs/MATH.md section 8).
 */

/** Team effects, in the units a player reads off a talent description. */
type Buffs = { atk: number; atk_: number; dmg: number; cr: number; cd: number; em: number };

const NO_BUFFS: Buffs = { atk: 0, atk_: 0, dmg: 0, cr: 0, cd: 0, em: 0 };

const BUFF_FIELDS: { key: keyof Buffs; label: string; note: string; max: number }[] = [
  { key: 'atk', label: 'Flat ATK', note: 'Bennett, Hu Tao’s skill', max: 5000 },
  { key: 'atk_', label: 'ATK%', note: 'resonance, Pyro 25%', max: 300 },
  { key: 'dmg', label: 'DMG%', note: 'for this element', max: 300 },
  { key: 'cr', label: 'CRIT Rate%', note: 'Favonius, Shenhe', max: 200 },
  { key: 'cd', label: 'CRIT DMG%', note: 'Yelan, Chongyun', max: 500 },
  { key: 'em', label: 'Elemental Mastery', note: 'Kazuha, Sucrose', max: 1500 },
];

/** How a player describes an enemy they are actually fighting. */
const DEFAULT_ENEMY_LEVEL = 90;
const DEFAULT_RESISTANCE = 10;

export function BuildScreen() {
  const [roster, setRoster] = useState<ImportedCharacter[]>([]);
  const [bag, setBag] = useState<ImportedArtifact[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [characterKey, setCharacterKey] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const [options, setOptions] = useState<TalentOption[]>([]);
  /** Whose talents `options` holds, so a stale list is never treated as ready. */
  const [talentsFor, setTalentsFor] = useState<string | null>(null);
  const [talentError, setTalentError] = useState<string | null>(null);

  const [enemyLevel, setEnemyLevel] = useState(DEFAULT_ENEMY_LEVEL);
  const [resistance, setResistance] = useState(DEFAULT_RESISTANCE);
  const [reactionId, setReactionId] = useState('none');
  const [erFloor, setErFloor] = useState(100);
  const [buffs, setBuffs] = useState<Buffs>(NO_BUFFS);

  useEffect(() => {
    let cancelled = false;
    void readOr(
      async (): Promise<[ImportedCharacter[], ImportedArtifact[]]> => [
        await listRoster(),
        await listArtifacts(),
      ],
      [[], []] as [ImportedCharacter[], ImportedArtifact[]],
    ).then(([characters, artifacts]) => {
      if (cancelled) return;
      setRoster(characters);
      setBag(artifacts);
      // The highest-level character is the one most likely to be worth
      // optimising, and listRoster already sorts that way.
      setCharacterKey((current) => current || (characters[0]?.key ?? ''));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const character = roster.find((entry) => entry.key === characterKey) ?? null;
  const data = characterKey ? CHARACTERS[characterKey] : undefined;

  // Talents are fetched per character, so this is the one piece of the input
  // that arrives asynchronously.
  useEffect(() => {
    if (!characterKey) return;
    let cancelled = false;

    void loadTalents(characterKey)
      .then((talents) => {
        if (cancelled) return;
        const found = talents ? talentOptions(talents) : [];
        setTalentError(null);
        setOptions(found);
        setTalentsFor(characterKey);
        // Prefer the Elemental Burst, which is what a player usually wants to
        // see a number for.
        const burst = found.findIndex((option) => option.group === 'burst');
        setHitIndex(burst >= 0 ? burst : 0);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOptions([]);
        setTalentsFor(characterKey);
        setTalentError(error instanceof Error ? error.message : 'Could not load that character.');
      });

    return () => {
      cancelled = true;
    };
  }, [characterKey]);

  const option = options[hitIndex] ?? null;
  const reactions = amplifyingFor(data?.element ?? null);

  const equipped = useMemo(() => equipAll(bag), [bag]);

  /** The talent level for the chosen hit, read off the scanner export. */
  const talentLevel = option && character ? character.talent[TALENT_LEVEL_KEYS[option.group]] : 1;

  const input = useMemo((): SearchInput | null => {
    if (!character || !data || !option) return null;

    const characterStats = characterBaseStats(
      characterScaling(data),
      character.level,
      character.ascension,
    );

    const weaponData = character.weapon ? WEAPONS[character.weapon.key] : undefined;
    const weaponStats = weaponData
      ? weaponBaseStats(
          weaponScaling(weaponData),
          Math.min(character.weapon?.level ?? 1, 90),
          character.weapon?.ascension ?? 0,
        ).stats
      : {};

    // Resolved here rather than in render: which coefficient a reaction is worth
    // depends on the character's element, so the two have to move together.
    const reaction = amplifyingFor(data.element).find((entry) => entry.id === reactionId) ?? null;

    const elementKey = data.element ? `${data.element}_dmg` : 'physical_dmg';
    const typed: StatMap = {
      atk: buffs.atk,
      atk_: buffs.atk_ / 100,
      cr: buffs.cr / 100,
      cd: buffs.cd / 100,
      em: buffs.em,
      [elementKey]: buffs.dmg / 100,
    };

    return {
      artifacts: equipped,
      character: characterStats.stats,
      weapon: weaponStats,
      buffs: typed,
      level: character.level,
      objective: {
        hit: option.hit,
        category: option.category,
        talentLevel,
        element: data.element,
        enemy: { level: enemyLevel, resistance: resistance / 100 },
        reaction: reaction
          ? { kind: 'amplifying', coefficient: reaction.coefficient }
          : { kind: 'none' },
        variant: option.variant,
      },
      sets: searchSets(option.category),
      constraints: erFloor > 100 ? { minEnergyRecharge: erFloor / 100 } : undefined,
      top: 1,
    };
  }, [
    character,
    data,
    option,
    equipped,
    buffs,
    talentLevel,
    enemyLevel,
    resistance,
    reactionId,
    erFloor,
  ]);

  const { search, pending, error } = useBuildSearch(input);
  const best = search?.best[0] ?? null;

  // Counts to its new value rather than snapping, the way /plan's always has.
  const numeral = useTweenedNumeral(best ? best.damage : null, (value) =>
    formatNumber(Math.round(value)),
  );

  /*
    The eruption, once per character rather than once per answer.

    Tying it to the search result would fire a full-screen burst on every nudge
    of the enemy level, which is the difference between a moment and a
    nuisance. Tying it to the character means it plays when you arrive at
    someone's build — which is when the screen has something to say.
  */
  const erupted = useRef<string | null>(null);
  useEffect(() => {
    if (!best || !characterKey || erupted.current === characterKey) return;
    erupted.current = characterKey;
    fireBurst(data?.element ?? null, best.damage);
  }, [best, characterKey, data]);

  const chosenSets = best ? activeSets(best.artifacts) : {};
  const resolved = best ? resolveSetBonuses(chosenSets) : null;

  const nothingImported = loaded && roster.length === 0 && bag.length === 0;

  /*
    Busy until there is an answer, not merely until the roster has loaded. The
    talent file is fetched per character, so there is a stretch where the roster
    is up, nothing is pending, and the numeral is still a dash — saying "not
    busy" there would announce an answer that does not exist yet.
  */
  const waitingForTalents = characterKey !== '' && talentsFor !== characterKey;
  const busy = !loaded || waitingForTalents || (input !== null && pending);

  return (
    <section className={screen.panel} aria-labelledby="build-title" aria-busy={busy}>
      <div>
        <p>
          <Link href="/account" className={styles.back}>
            ← Account
          </Link>
        </p>

        {nothingImported ? (
          <>
            <h1 className={screen.title} id="build-title">
              Best build
            </h1>
            <p className={styles.empty}>
              Nothing imported yet. This needs your artifacts and your talent levels, and a scanner
              export is the only thing that carries either. Account →{' '}
              <strong>Import inventory</strong>.
            </p>
          </>
        ) : (
          <AnswerBlock
            title={
              // The game's own capitalisation: "Skill DMG", not "skill dmg".
              character && option ? `${character.name}’s best ${option.label}` : 'Best build'
            }
            titleId="build-title"
            value={best ? formatNumber(Math.round(best.damage)) : '—'}
            valueRef={numeral}
            valueLabel={
              best ? `${formatNumber(Math.round(best.damage))} damage` : 'Nothing to show yet'
            }
          >
            <Verdict
              best={best !== null}
              option={option}
              talentLevel={talentLevel}
              bagSize={equipped.length}
              sets={chosenSets}
              exhaustive={search?.exhaustive ?? true}
              missing={search?.missing ?? []}
              reactionLabel={reactions.find((entry) => entry.id === reactionId)?.label ?? null}
              talentError={talentError}
              noTalents={loaded && characterKey !== '' && options.length === 0 && !talentError}
              searchError={error}
            />
          </AnswerBlock>
        )}
      </div>

      {!nothingImported ? (
        <div className={screen.colSide}>
          <label className={styles.label} htmlFor="build-character">
            Character
          </label>
          <select
            id="build-character"
            className={styles.select}
            value={characterKey}
            onChange={(event) => setCharacterKey(event.target.value)}
          >
            {roster.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name} — Lv {entry.level}
                {entry.constellation > 0 ? ` C${entry.constellation}` : ''}
              </option>
            ))}
          </select>

          <label className={styles.label} htmlFor="build-hit">
            Hit
          </label>
          <select
            id="build-hit"
            className={styles.select}
            value={hitIndex}
            onChange={(event) => setHitIndex(Number(event.target.value))}
            disabled={options.length === 0}
          >
            {options.map((entry, index) => (
              <option key={`${entry.group}-${entry.label}-${entry.variant}`} value={index}>
                {TALENT_GROUP_LABELS[entry.group]} — {entry.label}
              </option>
            ))}
          </select>

          {reactions.length > 0 ? (
            <SegmentedControl
              label="Reaction"
              value={reactionId}
              onChange={setReactionId}
              options={[
                { value: 'none', label: 'No reaction' },
                ...reactions.map((entry) => ({ value: entry.id, label: entry.label })),
              ]}
            />
          ) : null}

          <h2 className={screen.sec}>The enemy</h2>
          <StepperRow
            label="Level"
            value={enemyLevel}
            onChange={setEnemyLevel}
            min={1}
            max={110}
            note="A Spiral Abyss floor 12 enemy is 95 to 103."
          />
          <StepperRow
            label="Resistance"
            value={resistance}
            onChange={setResistance}
            min={-100}
            max={90}
            step={5}
            valueText={(value) => `${value} percent`}
            note="Most enemies are 10% to everything. Viridescent Venerer takes it to −20%."
          />

          <h2 className={screen.sec}>Requirements</h2>
          <StepperRow
            label="Energy Recharge floor"
            value={erFloor}
            onChange={setErFloor}
            min={100}
            max={400}
            step={10}
            valueText={(value) => `${value} percent`}
            note="100% means no requirement. A burst that does not come back does no damage."
          />

          <details className={styles.disclosure}>
            <summary className={styles.summary}>Team buffs</summary>
            <p className={styles.explain}>
              Typed in, never guessed. No dataset says what Bennett’s burst is worth on your team,
              so Starfall asks rather than inventing a number.
            </p>
            {BUFF_FIELDS.map((field) => (
              <StepperRow
                key={field.key}
                label={field.label}
                note={field.note}
                value={buffs[field.key]}
                onChange={(value) => setBuffs((current) => ({ ...current, [field.key]: value }))}
                min={0}
                max={field.max}
                step={field.key === 'atk' || field.key === 'em' ? 10 : 5}
              />
            ))}
          </details>

          {best ? (
            <>
              <h2 className={screen.sec}>What it chose</h2>
              <ul className={styles.pieces} aria-label="The five artifacts it chose">
                {best.artifacts.map((piece, index) => (
                  <li className={styles.piece} key={`${piece.slotKey}-${index}`}>
                    <span className={styles.pieceName}>
                      {ARTIFACT_SETS[piece.setKey]?.name ?? readableKey(piece.setKey)}
                    </span>
                    <span className={styles.pieceSlot}>{piece.slotKey}</span>
                    <span className={styles.pieceMain}>
                      {formatStat(piece.mainStat, piece.mainValue)}
                    </span>
                    <span className={styles.pieceSubs}>
                      {Object.entries(piece.substats)
                        .map(([key, value]) => `${statName(key)} ${formatStatValue(key, value)}`)
                        .join(', ') || 'no substats'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {resolved && resolved.unmodelled.length > 0 ? (
            <>
              <h2 className={screen.sec}>Not counted</h2>
              <ul className={styles.unmodelled} aria-label="Bonuses Starfall is not applying">
                {resolved.unmodelled.map((bonus) => (
                  <li key={`${bonus.setKey}-${bonus.pieces}`} className={styles.unmodelledItem}>
                    <strong>
                      {bonus.name} {bonus.pieces}-piece
                    </strong>
                    <span className={styles.reason}>{reasonFor(bonus)}</span>
                    {bonus.text ? <span className={styles.wording}>{bonus.text}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Why a bonus is listed rather than applied, in the player's terms. */
function reasonFor(bonus: UnmodelledBonus): string {
  switch (bonus.reason) {
    case 'conditional':
      return 'Depends on something Starfall cannot see. Add it under Team buffs if it is up.';
    case 'defensive':
      return 'Cannot change this number — it is resistance, shielding or healing.';
    case 'unknown':
      return 'From a patch newer than this copy of Starfall.';
  }
}

type VerdictProps = {
  best: boolean;
  option: TalentOption | null;
  talentLevel: number;
  bagSize: number;
  sets: Record<string, number>;
  exhaustive: boolean;
  missing: string[];
  reactionLabel: string | null;
  talentError: string | null;
  noTalents: boolean;
  searchError: Error | null;
};

/**
 * The sentence under the number.
 *
 * It has to say what the number is of, because a damage figure on its own is
 * meaningless — and it has to say when the number is not the proven best, which
 * is the only thing standing between an estimate and a claim.
 */
function Verdict({
  best,
  option,
  talentLevel,
  bagSize,
  sets,
  exhaustive,
  missing,
  reactionLabel,
  talentError,
  noTalents,
  searchError,
}: VerdictProps) {
  if (talentError) return <p className={screen.body}>{talentError}</p>;
  if (searchError) {
    return <p className={screen.body}>The search stopped: {searchError.message}</p>;
  }
  if (noTalents) {
    return (
      <p className={screen.body}>
        The game data carries no damage talents for this character, so there is nothing to optimise
        yet.
      </p>
    );
  }
  if (missing.length > 0) {
    return (
      <p className={screen.body}>
        No build is possible: nothing in the bag for the <strong>{missing.join(' or the ')}</strong>
        .
      </p>
    );
  }
  if (!best) {
    return (
      <p className={screen.body}>
        Nothing meets that Energy Recharge floor. Lower it, or farm a Recharge sands.
      </p>
    );
  }

  /*
    The bonus tier, not the piece count. Wearing five of a set is a real thing
    to do and the game still calls it a 4-piece bonus — "5-piece" is a phrase
    nobody uses and would read as a mistake.
  */
  const worn = Object.entries(sets)
    .filter(([, count]) => count >= 2)
    .map(
      ([key, count]) =>
        `${ARTIFACT_SETS[key]?.name ?? readableKey(key)} ${count >= 4 ? 4 : 2}-piece`,
    );

  return (
    <>
      <p className={screen.body}>
        {worn.length > 0 ? worn.join(' with ') : 'No set bonus'}, chosen from{' '}
        <strong>{formatNumber(bagSize)}</strong> artifacts. Talent level {talentLevel}
        {reactionLabel ? `, with ${reactionLabel.toLowerCase()}` : ''}.
      </p>
      <p className={screen.caption}>
        An expected value across crits, not a single hit — which is the right thing to maximise for
        a build you will play hundreds of times.
        {exhaustive
          ? ' Proven best: every combination was either checked or ruled out.'
          : ' The bag was too large to search completely, so this is the best found rather than the best there is.'}
      </p>
      {option ? (
        <p className={screen.caption}>
          {TALENT_GROUP_LABELS[option.group]}: {option.talentName}
        </p>
      ) : null}
    </>
  );
}
