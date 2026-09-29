import { loadOrCreateActivePlan, savePlan } from '@/db/plans';
import { knownWishIds, saveWishes, wishSummary } from '@/db/wishes';
import type { HistorySummary } from '@/engine/wish/history';

import { importWishes, type ImportProgress } from './wish-import';
import type { WishApiFailure } from './wish-api';

/**
 * One wish import, start to finish: fetch, store, derive, apply.
 *
 * Shared because there are now two ways in — a pasted link and a key minted
 * from a HoYoLAB cookie — and everything after the link is identical. A second
 * copy of this would be a second place for the plan to stop being updated.
 */

export type SyncResult = {
  /** New pulls stored by this run. Zero means the history was already current. */
  added: number;
  summary: HistorySummary;
  /** Set when the import stopped early; whatever it did reach is still stored. */
  reason?: WishApiFailure;
};

export async function syncWishes(
  link: string,
  options: { onProgress?: (progress: ImportProgress) => void } = {},
): Promise<SyncResult> {
  // Only reads back to what is already stored, so a second import is quick.
  const known = await knownWishIds();
  const result = await importWishes(link, { knownIds: known, onProgress: options.onProgress });

  if (result.wishes.length > 0) await saveWishes(result.wishes);
  const summary = await wishSummary();

  // Writes the derived pity and guarantee onto the active plan, creating one if
  // there is none: importing before ever opening the Plan screen is a normal
  // order to do things in, and discarding the result would be the worst answer.
  const plan = await loadOrCreateActivePlan();
  await savePlan({ ...plan, pity: summary.pity, guaranteed: summary.guaranteed });

  return {
    added: result.wishes.length,
    summary,
    reason: result.ok ? undefined : (result.reason as WishApiFailure),
  };
}
