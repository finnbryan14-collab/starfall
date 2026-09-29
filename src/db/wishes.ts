import { mergeWishes, summariseCharacterHistory, type Wish } from '@/engine/wish/history';

import { db } from './schema';

/**
 * Stored wish history.
 *
 * The game only serves about six months, so this store is the only lasting
 * record: imports merge by id and extend it rather than replacing it
 * (docs/DATA.md). The authkey that fetched them is never stored.
 */

export async function listWishes(): Promise<Wish[]> {
  const rows = await db.wishes.toArray();
  return rows.map((row) => row.data as Wish);
}

/** Ids already held, so a top-up import can stop as soon as it reaches them. */
export async function knownWishIds(): Promise<Set<string>> {
  return new Set(await db.wishes.toCollection().primaryKeys());
}

/** Merges an import in and returns the full history. */
export async function saveWishes(incoming: readonly Wish[]): Promise<Wish[]> {
  const existing = await listWishes();
  const merged = mergeWishes(existing, incoming);
  const now = Date.now();

  await db.wishes.bulkPut(
    merged.map((wish) => ({
      id: wish.id,
      gachaType: wish.gachaType,
      time: wish.time,
      data: wish,
      updatedAt: now,
    })),
  );

  return merged;
}

/** Pity, guarantee and luck, derived from everything stored. */
export async function wishSummary() {
  return summariseCharacterHistory(await listWishes());
}

export async function clearWishes(): Promise<void> {
  await db.wishes.clear();
}
