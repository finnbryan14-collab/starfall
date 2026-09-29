'use client';

import { useCallback, useRef, useState } from 'react';

import { exportBackup, restoreBackup } from '@/db/backup';
import {
  BACKUP_FAILURE_COPY,
  backupFilename,
  describeCounts,
  parseBackup,
  type Backup,
  type BackupTable,
} from '@/lib/backup';

import styles from './HoyolabPanel.module.css';

/**
 * Export and import everything as one JSON file.
 *
 * There is no server, so this file is the only copy of a player's history that
 * outlives a cleared browser. Restoring replaces rather than merges, so it
 * always asks first and says exactly what it is about to replace.
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'confirming'; backup: Backup; counts: Record<BackupTable, number>; from: string }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

export function BackupPanel() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);

  const download = useCallback(async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = backupFilename();
    link.click();
    URL.revokeObjectURL(url);

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
