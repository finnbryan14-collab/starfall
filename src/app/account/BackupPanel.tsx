'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { exportBackup, restoreBackup } from '@/db/backup';
import { db } from '@/db/schema';
import {
  BACKUP_FAILURE_COPY,
  backupFilename,
  describeCounts,
  parseBackup,
  type Backup,
  type BackupTable,
} from '@/lib/backup';
import { readOr } from '@/lib/storage';

import { useStoragePersistence } from './useStoragePersistence';
import styles from './HoyolabPanel.module.css';

/**
 * Where a player's data lives, and how to carry it somewhere else.
 *
 * Two different questions, answered together because they are really one.
 *
 * Everything is in IndexedDB on this device, which survives closing the app but
 * is *best-effort* by default: the browser may clear it to free space, and
 * WebKit evicts origins nobody has opened lately. So the first half of this
 * panel says where that stands and offers to ask for persistent mode.
 *
 * The second half is the file. There is no server, so a backup is the only copy
 * that outlives a cleared browser or a lost phone — and it is the honest answer
 * for anyone whose browser turned the request down. Restoring replaces rather
 * than merges, so it always asks first and says what it is about to replace.
 */

/** When the last backup was taken, so the panel can say how stale it is. */
const LAST_BACKUP_KEY = 'last-backup-at';

/** "3 days ago". Deliberately vague: the exact minute is never the question. */
function howLongAgo(then: number, now = Date.now()): string {
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/** "213 KB stored, of the 6.8 GB this browser allows." */
function describeSpace(usage: number, quota: number): string {
  const unit = (bytes: number) => {
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  };
  return `${unit(usage)} stored, of the ${unit(quota)} this browser allows.`;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'confirming'; backup: Backup; counts: Record<BackupTable, number>; from: string }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

export function BackupPanel() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const storage = useStoragePersistence();

  useEffect(() => {
    let cancelled = false;
    void readOr(() => db.settings.get(LAST_BACKUP_KEY), undefined).then((row) => {
      if (cancelled) return;
      if (typeof row?.value === 'number') setLastBackup(row.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const download = useCallback(async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = backupFilename();
    link.click();
    URL.revokeObjectURL(url);

    const at = Date.now();
    // Recorded rather than inferred from the file: the player keeps the file,
    // and Starfall never sees it again.
    await readOr(
      () => db.settings.put({ key: LAST_BACKUP_KEY, value: at, updatedAt: at }),
      undefined,
    );
    setLastBackup(at);

    setStatus({ kind: 'done', message: `Saved ${backupFilename()}.` });
  }, []);

  const pick = useCallback(async (file: File) => {
    const result = parseBackup(await file.text());

    if (!result.ok) {
      setStatus({ kind: 'failed', message: BACKUP_FAILURE_COPY[result.reason] });
      return;
    }

    setStatus({
      kind: 'confirming',
      backup: result.backup,
      counts: result.counts,
      from: result.backup.exportedAt.slice(0, 10),
    });
  }, []);

  const confirm = useCallback(async (backup: Backup, counts: Record<BackupTable, number>) => {
    await restoreBackup(backup);
    setStatus({
      kind: 'done',
      message: `Restored ${describeCounts(counts)}. Reload to see it everywhere.`,
    });
  }, []);

  return (
    <>
      <h2 className={styles.heading}>On this device</h2>
      <p className={styles.body}>
        {storage.loading ? 'Checking what this browser intends to keep…' : storage.advice.headline}
      </p>

      {storage.advice.canAsk ? (
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => void storage.ask()}>
            Keep my data on this device
          </button>
        </div>
      ) : null}

      {storage.advice.action ? <p className={styles.hint}>{storage.advice.action}</p> : null}

      {storage.usage ? (
        <p className={styles.hint}>{describeSpace(storage.usage.usage, storage.usage.quota)}</p>
      ) : null}

      <h2 className={styles.heading}>Backups</h2>
      <p className={styles.body}>
        Everything Starfall knows, in one file. There is no server, so this is the only copy that
        survives a cleared browser or a new laptop.
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => void download()}>
          Export a backup
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => fileInput.current?.click()}
        >
          Restore a backup
        </button>
      </div>

      <label className="sr-only" htmlFor="backup-file">
        Backup file
      </label>
      <input
        id="backup-file"
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

      <p className={styles.hint}>
        {lastBackup === null
          ? 'You have not exported one yet.'
          : `Last exported ${howLongAgo(lastBackup)}.`}
      </p>

      <p className={styles.hint}>
        Your HoYoLAB cookie is deliberately left out — a backup is a file you email yourself, and
        that cookie reads your whole account. You&rsquo;ll paste it again after a restore.
      </p>

      {status.kind === 'confirming' ? (
        <div className={styles.readout}>
          <p className={styles.line}>
            That backup is from <strong>{status.from}</strong> and holds{' '}
            <strong>{describeCounts(status.counts)}</strong>. Restoring replaces everything on this
            device — it does not merge.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void confirm(status.backup, status.counts)}
            >
              Replace everything
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
