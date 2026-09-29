import type { ImportedArtifact } from '@/lib/good';

import { db, type ArtifactRow } from './schema';

/**
 * The artifact inventory, as imported from a GOOD export.
 *
 * An import *replaces* the previous snapshot rather than merging into it
 * (docs/DATA.md). A scan is a photograph of the bag at a moment; merging two
 * would leave artifacts the player has long since fed to another one.
 */

export async function replaceInventory(artifacts: readonly ImportedArtifact[]): Promise<void> {
  const now = Date.now();
  const rows: ArtifactRow[] = artifacts.map((artifact) => ({
    id: artifact.id,
    setKey: artifact.setKey,
    slotKey: artifact.slotKey,
    location: artifact.location,
    data: artifact,
    updatedAt: now,
  }));

  // One transaction, so a failure part-way cannot leave half a bag behind.
  await db.transaction('rw', db.artifacts, async () => {
    await db.artifacts.clear();
    if (rows.length > 0) await db.artifacts.bulkPut(rows);
  });
}

export async function listArtifacts(): Promise<ImportedArtifact[]> {
  const rows = await db.artifacts.toArray();
  return rows.map((row) => row.data as ImportedArtifact);
}

export async function artifactCount(): Promise<number> {
  return db.artifacts.count();
}

export async function clearInventory(): Promise<void> {
  await db.artifacts.clear();
}
