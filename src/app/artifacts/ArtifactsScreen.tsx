'use client';

import { animate, scrambleText } from 'animejs';
import { useMemo, useRef, useState } from 'react';

import { ScoreHistogram } from '@/components/ScoreHistogram';
import screen from '@/components/screen.module.css';
import { AnswerBlock, StepperRow } from '@/components/ui';
import {
  MAIN_STAT_ODDS,
  SUBSTATS,
  SUBSTAT_KEYS,
  UPGRADE_LEVELS,
  candidateSubstats,
  simulateToMax,
  type MainStatKey,
  type Slot,
  type SubstatKey,
  type Substats,
} from '@/engine/artifacts/model';
import { DEFAULT_TRIALS, VERDICT_COPY, type Goal } from '@/engine/artifacts/score';
import { WEIGHT_PRESETS, presetById } from '@/engine/artifacts/weights';
import { mulberry32 } from '@/engine/rng';
import { formatNumber } from '@/lib/format';
import { STAT_NAMES as MAIN_STAT_NAMES } from '@/lib/stats';
import { duration, useReducedMotion } from '@/motion';
import { useArtifacts } from '@/workers/useArtifacts';

import styles from './ArtifactsScreen.module.css';

/**
 * Keep or trash, and what a replacement would cost.
 *
 * The simulations run in a worker (see useArtifacts); this only renders them.
 * Entry is built for speed on a phone: native selects, numeric keypads, and a
 * stat picker that only ever offers stats the piece could actually have.
 */

const SLOTS: { value: Slot; label: string }[] = [
  { value: 'flower', label: 'Flower' },
  { value: 'plume', label: 'Plume' },
  { value: 'sands', label: 'Sands' },
  { value: 'goblet', label: 'Goblet' },
  { value: 'circlet', label: 'Circlet' },
];

type Line = { key: SubstatKey | ''; value: number };

const STARTING_LINES: Line[] = [
  { key: 'cr', value: 3.11 },
  { key: 'cd', value: 6.99 },
  { key: 'er', value: 5.18 },
  { key: 'def', value: 18.52 },
];

const format = (key: SubstatKey, value: number) =>
  SUBSTATS[key].isPercent ? value.toFixed(1) : formatNumber(value);

export function ArtifactsScreen() {
  const [slot, setSlot] = useState<Slot>('sands');
  const [mainStat, setMainStat] = useState<MainStatKey>('atk_');
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState<Line[]>(STARTING_LINES);
  const [threshold, setThreshold] = useState(30);
  const [presetId, setPresetId] = useState<string>('');
  const [rolled, setRolled] = useState<Substats | null>(null);

  const reduced = useReducedMotion();
  const subsRef = useRef<HTMLUListElement>(null);

  const subs: Substats = useMemo(() => {
    const result: Substats = {};
    for (const line of lines) {
      if (line.key) result[line.key] = line.value;
    }
    return result;
  }, [lines]);

  const goal: Goal = useMemo(() => {
    const preset = presetId ? presetById(presetId) : undefined;
    return preset
      ? { kind: 'weighted', weights: preset.weights, threshold }
      : { kind: 'critValue', threshold };
  }, [presetId, threshold]);

  const { score, resin, pending } = useArtifacts(
    { subs, level, mainStat, goal, trials: DEFAULT_TRIALS },
    { slot, mainStat, goal },
  );

  const mainStatOptions = Object.keys(MAIN_STAT_ODDS[slot]) as MainStatKey[];
  const goalUnit = goal.kind === 'critValue' ? 'crit value' : 'weighted rolls';

  /** Only stats this piece could still have: not the main stat, not a duplicate. */
  const optionsFor = (index: number) => {
    const taken = lines.filter((_, i) => i !== index).map((line) => line.key);
    return candidateSubstats(mainStat, taken.filter(Boolean) as string[]);
  };

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((previous) => previous.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const showRoll = (finished: Substats) => {
    setRolled(finished);
    const root = subsRef.current;
    if (!root) return;

    const move = duration('move');
    root.querySelectorAll<HTMLElement>('[data-roll-value]').forEach((element, i) => {
      const key = element.dataset.rollValue as SubstatKey;
      const value = finished[key];
      if (value === undefined) return;
      const text = format(key, value);

      if (reduced || move <= 0) {
        element.textContent = text;
        return;
      }
      // scrambleText writes innerHTML, and a trailing % would be treated as a
      // unit and doubled — so the unit lives in a sibling span, not here.
      animate(element, {
        innerHTML: scrambleText({ text, chars: '0-9' }),
        duration: 700,
        delay: i * 70,
      });
    });
  };

  const displayed = rolled ?? subs;
  const displayLevel = rolled ? 20 : level;

  return (
    <section className={screen.panel} aria-labelledby="art-title">
      <div>
        <AnswerBlock
          title={`Worth leveling this ${slot}?`}
          titleId="art-title"
          value={score ? (score.result.probability * 100).toFixed(1) : '—'}
          unit={score ? '%' : undefined}
          valueLabel={
            score ? `${(score.result.probability * 100).toFixed(1)} percent` : 'Calculating'
          }
        >
          {score ? (
            <>
              <strong className={styles[`verdict_${score.result.verdict}`]}>
                {VERDICT_COPY[score.result.verdict]}
              </strong>{' '}
              {oddsPhrase(score.result.probability)} it finishes at {threshold}+ {goalUnit}.
            </>
          ) : (
            <>Working out where this piece can land.</>
          )}
        </AnswerBlock>

        <div className={styles.piece}>
          <div className={styles.pieceHead}>
            <p className={styles.pieceName}>
              {SLOTS.find((s) => s.value === slot)?.label}, {MAIN_STAT_NAMES[mainStat]}
            </p>
            <p className={styles.pieceMeta}>
              <span className={styles.stars} aria-label="5 stars">
                ★★★★★
              </span>{' '}
              +{displayLevel}, {lines.filter((l) => l.key).length} substats
            </p>
          </div>

          <ul className={styles.subs} ref={subsRef}>
            {lines.map((line, index) => (
              <li key={index} className={styles.sub}>
                <label className="sr-only" htmlFor={`sub-${index}`}>
                  Substat {index + 1}
                </label>
                <select
                  id={`sub-${index}`}
                  className={styles.select}
                  value={line.key}
                  onChange={(event) => {
                    setRolled(null);
                    setLine(index, { key: event.target.value as SubstatKey | '' });
                  }}
                >
                  <option value="">None</option>
                  {optionsFor(index).map((key) => (
                    <option key={key} value={key}>
                      {SUBSTATS[key].name}
                    </option>
                  ))}
                </select>

                {line.key ? (
                  <span className={styles.value}>
                    <span data-roll-value={line.key}>
                      {rolled ? format(line.key, displayed[line.key] ?? 0) : null}
                    </span>
                    {rolled ? null : (
                      <>
                        <label className="sr-only" htmlFor={`val-${index}`}>
                          {SUBSTATS[line.key].name} value
                        </label>
                        <input
                          id={`val-${index}`}
                          className={styles.number}
                          type="text"
                          inputMode="decimal"
                          value={String(line.value)}
                          onChange={(event) =>
                            setLine(index, { value: Number(event.target.value) || 0 })
                          }
                        />
                      </>
                    )}
                    {SUBSTATS[line.key].isPercent ? <span aria-hidden="true">%</span> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className={screen.ledger} style={{ marginTop: 'var(--s-5)' }}>
          <StepperRow
            label={`Goal: ${goalUnit}`}
            note={
              goal.kind === 'critValue'
                ? '2 × CRIT Rate + CRIT DMG at +20'
                : 'Weighted rolls at +20'
            }
            value={threshold}
            onChange={setThreshold}
            min={1}
            max={100}
            step={goal.kind === 'critValue' ? 5 : 1}
          />
        </div>

        {score ? (
          <ScoreHistogram
            histogram={score.histogram}
            goalThreshold={threshold}
            probability={score.result.probability}
            trials={score.result.trials}
            unit={goalUnit}
          />
        ) : null}

        <div className={screen.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              // A fresh seed each press: this is one sampled outcome, not the
              // deterministic verdict above.
              const rng = mulberry32((Date.now() & 0xffffffff) >>> 0);
              showRoll(simulateToMax(subs, level, mainStat, rng));
            }}
          >
            {rolled ? 'Roll again' : 'Roll to +20'}
          </button>
          {rolled ? (
            <button type="button" className={styles.quiet} onClick={() => setRolled(null)}>
              Back to +{level}
            </button>
          ) : null}
        </div>

        {rolled && score ? (
          <p className={styles.rollNote} aria-live="polite">
            This roll finished at {scoreText(rolled, goal)} {goalUnit}
            {scoreValue(rolled, goal) >= threshold ? ', past your goal' : ', short of your goal'}.
            Every roll lands differently; the {(score.result.probability * 100).toFixed(1)}% covers
            all of them.
          </p>
        ) : null}
      </div>

      <div className={screen.colSide}>
        <h2 className={screen.sec}>This piece</h2>
        <div className={screen.ledger}>
          <div className={screen.row}>
            <label className={screen.rowLabel} htmlFor="slot">
              Slot
            </label>
            <select
              id="slot"
              className={styles.select}
              value={slot}
              onChange={(event) => {
                const next = event.target.value as Slot;
                setSlot(next);
                setRolled(null);
                // Keep the main stat legal for the new slot.
                const allowed = Object.keys(MAIN_STAT_ODDS[next]) as MainStatKey[];
                if (!allowed.includes(mainStat)) setMainStat(allowed[0]);
              }}
            >
              {SLOTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={screen.row}>
            <label className={screen.rowLabel} htmlFor="main">
              Main stat
            </label>
            <select
              id="main"
              className={styles.select}
              value={mainStat}
              disabled={mainStatOptions.length === 1}
              onChange={(event) => {
                setMainStat(event.target.value as MainStatKey);
                setRolled(null);
              }}
            >
              {mainStatOptions.map((key) => (
                <option key={key} value={key}>
                  {MAIN_STAT_NAMES[key]}
                </option>
              ))}
            </select>
          </div>

          <StepperRow
            label="Level"
            note="Where the piece is now"
            value={level}
            onChange={(next) => {
              setLevel(next);
              setRolled(null);
            }}
            max={20}
            step={4}
            valueText={(v) => `plus ${v}`}
          />

          <div className={screen.row}>
            <label className={screen.rowLabel} htmlFor="preset">
              Judge it for
              <span className={screen.rowNote}>
                {presetId ? presetById(presetId)?.note : 'Crit value, the all-purpose measure'}
              </span>
            </label>
            <select
              id="preset"
              className={styles.select}
              value={presetId}
              onChange={(event) => setPresetId(event.target.value)}
            >
              <option value="">Crit value</option>
              {WEIGHT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 className={screen.sec}>Farming a replacement</h2>
        <p className={screen.body}>
          An on-set {MAIN_STAT_NAMES[mainStat]} {slot} that finishes at {threshold}+ {goalUnit},
          from its domain at 20 resin a run.
        </p>

        {resin && Number.isFinite(resin.median.runs) ? (
          <div className={screen.ledger} style={{ marginTop: 'var(--s-3)' }}>
            <div className={screen.row}>
              <span className={screen.rowLabel}>Half the time</span>
              <span className={screen.rowValue}>
                {formatNumber(resin.median.resin)} resin
                <small>{formatNumber(resin.median.days)} days of natural resin</small>
              </span>
            </div>
            <div className={screen.row}>
              <span className={screen.rowLabel}>9 times in 10</span>
              <span className={screen.rowValue}>
                {formatNumber(resin.p90.resin)} resin
                <small>{formatNumber(resin.p90.days)} days of natural resin</small>
              </span>
            </div>
          </div>
        ) : (
          <p className={screen.body}>
            {pending ? 'Working it out…' : 'This domain cannot drop that piece at all.'}
          </p>
        )}
      </div>
    </section>
  );
}

function oddsPhrase(probability: number): string {
  if (probability >= 0.45 && probability <= 0.55) return 'About even odds';
  if (probability > 0.55) return 'Better than even odds';
  return `Roughly ${Math.max(1, Math.round(probability * 10))} in 10 odds`;
}

function scoreValue(subs: Substats, goal: Goal): number {
  return goal.kind === 'critValue'
    ? 2 * (subs.cr ?? 0) + (subs.cd ?? 0)
    : SUBSTAT_KEYS.reduce(
        (sum, key) => sum + ((subs[key] ?? 0) / SUBSTATS[key].max) * (goal.weights[key] ?? 0),
        0,
      );
}

function scoreText(subs: Substats, goal: Goal): string {
  return scoreValue(subs, goal).toFixed(1);
}

/** Levels at which a piece gains a roll, exported for the level stepper's note. */
export { UPGRADE_LEVELS };
