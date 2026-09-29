'use client';

import { BANNER_TYPES, type Wish } from '@/engine/wish/history';

import { failureForRetcode, PAGE_DELAY_MS, parseWishAuth, type WishApiFailure } from './wish-api';

/**
 * Driving a wish-history import from the browser.
 *
 * The paging, the pacing and the merging all live here; the route is only a
 * CORS proxy (docs/DATA.md). That keeps a serverless function from running for
 * the minute a full history takes, and lets the screen show progress.
 *
 * The authkey stays in this function's scope for the length of the import and
 * is never written anywhere. What gets stored is the pulls.
 */

/** Every banner, so a full import is a complete record. */
export const IMPORT_BANNERS = [
  { type: BANNER_TYPES.character, label: 'Character event' },
  { type: BANNER_TYPES.character2, label: 'Character event 2' },
  { type: BANNER_TYPES.weapon, label: 'Weapon event' },
  { type: BANNER_TYPES.chronicled, label: 'Chronicled' },
  { type: BANNER_TYPES.standard, label: 'Standard' },
  { type: BANNER_TYPES.beginner, label: "Beginners'" },
] as const;

export type ImportProgress = {
  bannerLabel: string;
  bannerIndex: number;
  bannerCount: number;
  /** Pulls found so far, across every banner. */
  found: number;
};

export type ImportResult =
  { ok: true; wishes: Wish[] } | { ok: false; reason: WishApiFailure; wishes: Wish[] };

type RawWish = {
  id?: unknown;
  gacha_type?: unknown;
  rank_type?: unknown;
  item_type?: unknown;
  name?: unknown;
  time?: unknown;
};

/** Narrows an API row, dropping anything malformed rather than trusting it. */
function toWish(raw: RawWish): Wish | null {
  if (
    typeof raw.id !== 'string' ||
    typeof raw.gacha_type !== 'string' ||
    typeof raw.rank_type !== 'string' ||
    typeof raw.name !== 'string'
  ) {
    return null;
  }
  return {
    id: raw.id,
    gachaType: raw.gacha_type,
    rankType: raw.rank_type,
    itemType: typeof raw.item_type === 'string' ? raw.item_type : '',
    name: raw.name,
    time: typeof raw.time === 'string' ? raw.time : '',
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ImportOptions = {
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
  /** Stops early once a known id is reached, for a top-up rather than a full read. */
  knownIds?: ReadonlySet<string>;
};

export async function importWishes(
  url: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { onProgress, signal, knownIds } = options;

  // Validated here too, so a bad paste never even reaches the proxy.
  if (!parseWishAuth(url)) return { ok: false, reason: 'bad-url', wishes: [] };

  const collected: Wish[] = [];

  for (const [index, banner] of IMPORT_BANNERS.entries()) {
    let endId = '0';

    for (;;) {
      if (signal?.aborted) return { ok: true, wishes: collected };

      let response: Response;
      try {
        response = await fetch('/api/wishes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // POST, so the authkey never lands in a URL and therefore never in
          // an access log.
          body: JSON.stringify({ url, gachaType: banner.type, endId }),
        });
      } catch {
        return { ok: false, reason: 'network', wishes: collected };
      }

      let body: { retcode?: number; data?: { list?: RawWish[] }; error?: string };
      try {
        body = await response.json();
      } catch {
        return { ok: false, reason: 'unexpected', wishes: collected };
      }

      if (body.error) {
        return { ok: false, reason: body.error as WishApiFailure, wishes: collected };
      }

      const failure = failureForRetcode(body.retcode ?? 0);
      if (failure === 'visit-too-frequently') {
        // Asked to slow down: back off and retry the same page rather than
        // losing it.
        await wait(PAGE_DELAY_MS * 4);
        continue;
      }
      if (failure) return { ok: false, reason: failure, wishes: collected };

      const list = body.data?.list ?? [];
      if (list.length === 0) break;

      let reachedKnown = false;
      for (const raw of list) {
        const wish = toWish(raw);
        if (!wish) continue;
        // Everything older than this is already stored, so stop reading.
        if (knownIds?.has(wish.id)) {
          reachedKnown = true;
          break;
        }
        collected.push(wish);
      }

      onProgress?.({
        bannerLabel: banner.label,
        bannerIndex: index,
        bannerCount: IMPORT_BANNERS.length,
        found: collected.length,
      });

      if (reachedKnown) break;

      const last = list[list.length - 1];
      if (typeof last?.id !== 'string') break;
      endId = last.id;

      // Paced so an import never looks like an attack.
      await wait(PAGE_DELAY_MS);
    }
  }

  return { ok: true, wishes: collected };
}
