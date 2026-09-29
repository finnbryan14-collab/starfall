'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { artifactCount, replaceInventory } from '@/db/artifacts';
import {
  countBySlot,
  describeGood,
  GOOD_FAILURE_COPY,
  parseGood,
  toImportedArtifacts,
  type GoodCounts,
  type ImportedArtifact,
} from '@/lib/good';
import { formatNumber } from '@/lib/format';

import styles from './HoyolabPanel.module.css';

/**
 * Importing a full inventory from a community scanner.
 *
 * Enka only returns showcased characters and what they are wearing; everything
 * in the bag comes from here. An import replaces the previous snapshot, so it
 * always asks first and says what it found — including what it could not read.
 */

type Status =
  | { kind: 'idle' }
  | {
      kind: 'confirming';
      artifacts: ImportedArtifact[];
      counts: GoodCounts;
      source: string;
    }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

const SLOT_NAMES = {
  flower: 'Flower',
  plume: 'Plume',
  sands: 'Sands',
  goblet: 'Goblet',
  circlet: 'Circlet',
} as const;

export function GoodImport() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [stored, setStored] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void artifactCount().then((count) => {
      if (!cancelled) setStored(count);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = useCallback(async (file: File) => {
    const result = parseGood(await file.text());

    if (!result.ok) {
      setStatus({ kind: 'failed', message: GOOD_FAILURE_COPY[result.reason] });
      return;
    }

    setStatus({
      kind: 'confirming',
      artifacts: toImportedArtifacts(result.good),
      counts: result.counts,
      source: result.source,
    });
  }, []);

  const confirm = useCallback(async (artifacts: ImportedArtifact[], counts: GoodCounts) => {
    await replaceInventory(artifacts);
    setStored(artifacts.length);
    setStatus({ kind: 'done', message: `Imported ${describeGood(counts)}.` });
  }, []);

  return (
    <>
      <h2 className={styles.heading}>Full inventory</h2>
      <p className={styles.body}>
        Enka only sends the characters in your showcase and what they&rsquo;re wearing. For
        everything in the bag, export a GOOD file from a scanner — Inventory Kamera on PC, or one of
        the Android scanners — and drop it here.
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => fileInput.current?.click()}
        >
          Import inventory
        </button>
      </div>

      <label className="sr-only" htmlFor="good-file">
        GOOD inventory file
      </label>
      <input
        id="good-file"
        ref={fileInput}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice fires again.
          event.target.value = '';
          if (file) void pick(file);
        }}
      />

      {stored !== null && stored > 0 && status.kind !== 'confirming' ? (
        <p className={styles.hint}>
          {formatNumber(stored)} {stored === 1 ? 'artifact' : 'artifacts'} stored. A new import
          replaces them.
        </p>
      ) : null}

      {status.kind === 'confirming' ? (
        <div className={styles.readout}>
          <p className={styles.line}>
            From <strong>{status.source}</strong>: <strong>{describeGood(status.counts)}</strong>.
            Importing replaces the inventory on this device.
          </p>

          <ul className={styles.sources}>
            {Object.entries(countBySlot(status.artifacts)).map(([slot, count]) => (
              <li key={slot}>
                <span>{SLOT_NAMES[slot as keyof typeof SLOT_NAMES]}</span>
                <b>{formatNumber(count)}</b>
              </li>
            ))}
          </ul>

          {status.counts.skipped > 0 ? (
            <p className={styles.hint}>
              {/*
                Said rather than swallowed: a scanner that misreads main stats
                would otherwise lose artifacts silently, and the count is the
                only way to notice.
              */}
              {formatNumber(status.counts.skipped)}{' '}
              {status.counts.skipped === 1 ? 'artifact was' : 'artifacts were'} skipped — their main
              stat isn&rsquo;t one Starfall recognises. Everything else comes across.
            </p>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void confirm(status.artifacts, status.counts)}
            >
              Replace my inventory
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setStatus({ kind: 'idle' })}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {status.kind === 'failed' ? (
        <p className={styles.failure} role="alert">
          {status.message}
        </p>
      ) : null}

      {status.kind === 'done' ? (
        <p className={styles.success} aria-live="polite">
          {status.message}
        </p>
      ) : null}
    </>
  );
}
